
import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException, Logger
} from '@nestjs/common';


import { createHmac, timingSafeEqual } from 'crypto';


import { ConfigService } from '@nestjs/config';
import { AuditAction } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';

import {
  assertActorInHotel,
  assertCanManagePayoutAccount,
} from './hotel-access.helper';

import { SavePayoutAccountDto } from './dto/payout.dto';

export interface Bank {
  name: string;
  code: string;
}

@Injectable()
export class PayoutService {
  private readonly secret: string;
  private readonly commissionPercent: number;

  private bankCache: {
    at: number;
    banks: Bank[];
  } | null = null;

  constructor(
    private prisma: PrismaService,
    private auditLog: AuditLogService,
    private config: ConfigService,
  ) {
    this.secret = this.config.get('PAYSTACK_SECRET_KEY', '');

    // This is HotelMS's platform commission.
    // Your current business model is 0%.
    this.commissionPercent = Number(
      this.config.get('PLATFORM_COMMISSION_PERCENT', 0),
    );
  }

  /**
   * Make an authenticated request to Paystack.
   */
  private async paystack(
    path: string,
    init: {
      method?: string;
      body?: any;
    } = {},
  ) {
    const res = await fetch(`https://api.paystack.co${path}`, {
      method: init.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${this.secret}`,
        'Content-Type': 'application/json',
      },
      body: init.body
        ? JSON.stringify(init.body)
        : undefined,
    });

    const json = (await res.json()) as any;

    if (!json?.status) {
      throw new BadRequestException(
        json?.message || 'Paystack request failed',
      );
    }

    return json.data;
  }

  /**
   * Get Nigerian banks supported by Paystack.
   *
   * Result is cached for 24 hours to avoid repeatedly
   * calling Paystack for the same bank list.
   */
  async listBanks(): Promise<Bank[]> {
    const DAY = 24 * 60 * 60 * 1000;

    if (
      this.bankCache &&
      Date.now() - this.bankCache.at < DAY
    ) {
      return this.bankCache.banks;
    }

    const data = await this.paystack(
      '/bank?country=nigeria&currency=NGN&perPage=100',
    );

    const banks: Bank[] = (data as any[])
      .map((bank) => ({
        name: bank.name,
        code: bank.code,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    this.bankCache = {
      at: Date.now(),
      banks,
    };

    return banks;
  }

  /**
   * Resolve a Nigerian bank account through Paystack.
   *
   * The account name returned by Paystack is trusted instead
   * of accepting an account name from the frontend.
   */
  async resolveAccount(
    bankCode: string,
    accountNumber: string,
  ) {
    const data = await this.paystack(
      `/bank/resolve?account_number=${encodeURIComponent(
        accountNumber,
      )}&bank_code=${encodeURIComponent(bankCode)}`,
    );

    return {
      accountName: data.account_name as string,
    };
  }

  /**
   * Get the current payout configuration for a hotel.
   *
   * Uses general hotel access because this is a read operation.
   *
   * The full account number is NEVER returned.
   */
  async getStatus(
    hotelId: string,
    actorUserId: string,
  ) {
    await assertActorInHotel(
      this.prisma,
      actorUserId,
      hotelId,
    );

    const hotel = await this.prisma.hotel.findUnique({
      where: { id: hotelId },
      select: {
        paystackSubaccountCode: true,
        payoutBankName: true,
        payoutAccountName: true,
        payoutAccountLast4: true,
      },
    });

    if (!hotel) {
      throw new NotFoundException('Hotel not found');
    }

    return {
      configured: !!hotel.paystackSubaccountCode,
      bankName: hotel.payoutBankName,
      accountName: hotel.payoutAccountName,
      accountLast4: hotel.payoutAccountLast4,
    };
  }

  /**
   * Create or update the hotel's Paystack payout account.
   *
   * IMPORTANT:
   * Only:
   *   - SUPER_ADMIN
   *   - HOTEL_DIRECTOR of this hotel
   *   - ADMIN of this hotel
   *
   * can perform this operation.
   *
   * Regular hotel staff cannot change the payout account.
   */
  async save(
    hotelId: string,
    dto: SavePayoutAccountDto,
    actorUserId: string,
  ) {
    // Financially sensitive operation:
    // do NOT use assertActorInHotel() here because that
    // would also allow regular hotel staff.
    await assertCanManagePayoutAccount(
      this.prisma,
      actorUserId,
      hotelId,
    );

    /**
     * Get the hotel.
     */
    const hotel = await this.prisma.hotel.findUnique({
      where: { id: hotelId },
      select: {
        name: true,
        paystackSubaccountCode: true,
      },
    });

    if (!hotel) {
      throw new NotFoundException('Hotel not found');
    }

    /**
     * Make sure the submitted bank code is one of
     * Paystack's supported Nigerian banks.
     */
    const bank = (await this.listBanks()).find(
      (item) => item.code === dto.bankCode,
    );

    if (!bank) {
      throw new BadRequestException('Unknown bank');
    }

    /**
     * Resolve the account through Paystack.
     *
     * We don't trust an account name supplied by the frontend.
     */
    const { accountName } = await this.resolveAccount(
      dto.bankCode,
      dto.accountNumber,
    );

    /**
     * Paystack subaccount configuration.
     *
     * percentage_charge is HotelMS's platform commission,
     * NOT Paystack's processing fee.
     *
     * Your current setting:
     *
     * PLATFORM_COMMISSION_PERCENT=0
     *
     * means HotelMS takes 0% per booking.
     */
    const body = {
      business_name: hotel.name,
      settlement_bank: dto.bankCode,
      account_number: dto.accountNumber,
      percentage_charge: this.commissionPercent,
      description: `Payout account for ${hotel.name}`,
    };

    /**
     * If the hotel already has a Paystack subaccount,
     * update it.
     *
     * Otherwise create a new one.
     */
    const sub = hotel.paystackSubaccountCode
      ? await this.paystack(
          `/subaccount/${hotel.paystackSubaccountCode}`,
          {
            method: 'PUT',
            body,
          },
        )
      : await this.paystack('/subaccount', {
          method: 'POST',
          body,
        });

    /**
     * Paystack returns the subaccount code.
     *
     * For an update, fall back to the existing code if
     * Paystack doesn't return a new one.
     */
    const code =
      sub?.subaccount_code ??
      hotel.paystackSubaccountCode;

    if (!code) {
      throw new BadRequestException(
        'Paystack subaccount was not created successfully',
      );
    }

    /**
     * Save only the safe payout information locally.
     *
     * We deliberately do NOT store the full account number.
     */
    await this.prisma.hotel.update({
      where: { id: hotelId },
      data: {
        paystackSubaccountCode: code,
        payoutBankCode: bank.code,
        payoutBankName: bank.name,
        payoutAccountName: accountName,
        payoutAccountLast4:
          dto.accountNumber.slice(-4),
      },
    });

    /**
     * Record the payout-account change.
     *
     * Never put the full bank account number into the audit log.
     */
    await this.auditLog
      .create({
        userId: actorUserId,
        hotelId,
        action: AuditAction.UPDATE,
        entity: 'Hotel',
        entityId: hotelId,
        newValues: {
          payoutBank: bank.name,
          payoutAccountLast4:
            dto.accountNumber.slice(-4),
          subaccount: code,
        },
      })
      .catch(() => {});

    /**
     * Return the masked/safe payout status.
     */
    return this.getStatus(
      hotelId,
      actorUserId,
    );
  }
}

