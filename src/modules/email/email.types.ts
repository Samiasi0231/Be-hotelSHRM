// src/modules/email/email.types.ts
import { Role } from '@prisma/client';

export interface EmailContent {
  subject: string;
  html: string;
}

export interface GuestBookingConfirmationData {
  guestName: string;
  guestEmail: string;
  bookingRef: string;
  hotelName: string;
  hotelPhone: string;
  hotelEmail: string;
  hotelAddress: string;
  hotelCity: string;
  roomType: string;
  roomNumber: string;
  checkIn: Date;
  checkOut: Date;
  nights: number;
  adults: number;
  children: number;
  totalAmount: number;
  specialRequests?: string;
}

export interface HotelNewBookingAlertData {
  directorEmail: string;
  hotelName: string;
  bookingRef: string;
  guestName: string;
  guestEmail: string;
  guestPhone: string;
  roomType: string;
  roomNumber: string;
  checkIn: Date;
  checkOut: Date;
  nights: number;
  adults: number;
  children: number;
  totalAmount: number;
  specialRequests?: string;
  dashboardUrl: string;
}

export interface InviteEmailData {
  token: string; // kept for API compatibility — the link already carries it
  role: Role;
  inviteUrl: string;
  hotelName?: string;
}