// src/app/api/auth/signup/route.ts — Registration endpoint.
//
// Creates BOTH:
//   1. A User row in the main app DB (so the new user can sign in)
//   2. A RegistrationDetails row in logic_details_db (legacy store)
//   3. A RegisterData row in the NEW register_data_db (primary store)
//
// The register_data_db is the canonical store with 3 tables:
// RegisterData, RegisterActivity, RegisterAuditLog.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { hashPassword } from '@/services/auth/password';
import { RoleEnum } from '@/lib/enums';
import { withErrorHandler, ValidationError, ConflictError } from '@/lib/api-error';
import {
  findRegistrationByEmail,
  insertRegistration,
} from '@/lib/logic-details-db';
import {
  findRegisterByEmail,
  insertRegistration as insertRegisterData,
} from '@/lib/register-data-db';

const Body = z.object({
  // Required
  email: z.string().email('Please enter a valid email address'),
  fullName: z.string().min(2, 'Name must be at least 2 characters').max(80),
  password: z.string().min(6, 'Password must be at least 6 characters').max(120),
  // Optional
  role: RoleEnum.optional(),
  customerId: z.string().optional(),
  phone: z.string().max(40).optional(),
  company: z.string().max(120).optional(),
  jobTitle: z.string().max(120).optional(),
  country: z.string().max(80).optional(),
  city: z.string().max(80).optional(),
  address: z.string().max(400).optional(),
  addressLine1: z.string().max(400).optional(),
  zipCode: z.string().max(20).optional(),
  agreeToTerms: z.boolean().refine((v) => v === true, {
    message: 'You must agree to the Terms of Service',
  }),
  marketingOptIn: z.boolean().optional(),
});

export const POST = withErrorHandler(async (req) => {
  const json = await req.json().catch(() => ({}));
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues);
  }
  const data = parsed.data;
  const email = data.email.trim().toLowerCase();

  // 1. Check the NEW register_data_db first (canonical).
  const existingNew = findRegisterByEmail(email);
  if (existingNew) {
    throw new ConflictError('An account with this email already exists.');
  }
  // Also check the legacy logic_details_db + main User table.
  const existingLegacy = findRegistrationByEmail(email);
  const existingUser = await db.user.findUnique({ where: { email } });
  if (existingLegacy || existingUser) {
    throw new ConflictError('An account with this email already exists.');
  }

  // 2. For CUSTOMER role, validate the customer exists.
  if (data.role === 'CUSTOMER' && data.customerId) {
    const customer = await db.customer.findUnique({ where: { id: data.customerId } });
    if (!customer) {
      throw new ValidationError(
        [{ code: 'custom', path: ['customerId'], message: 'Customer does not exist' }] as any,
        'Invalid customer',
      );
    }
  }

  const passwordHash = hashPassword(data.password);
  const role = data.role ?? 'SALES_REP';

  // 3. Create the User row in the main app DB (so they can sign in).
  const user = await db.user.create({
    data: {
      email,
      name: data.fullName,
      passwordHash,
      role,
      customerId: role === 'CUSTOMER' ? data.customerId : null,
      active: true,
    },
    select: { id: true, email: true, name: true, role: true, customerId: true },
  });

  // 4. Capture request metadata.
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
  const userAgent = req.headers.get('user-agent') ?? null;

  // 5. Insert into the NEW register_data_db (primary).
  const nameParts = data.fullName.split(' ');
  const firstName = nameParts[0] ?? data.fullName;
  const lastName = nameParts.slice(1).join(' ') || null;
  let newRegisterId: number;
  try {
    newRegisterId = insertRegisterData({
      userId: user.id,
      firstName,
      lastName,
      fullName: data.fullName,
      email,
      passwordHash,
      phone: data.phone ?? undefined,
      company: data.company ?? undefined,
      jobTitle: data.jobTitle ?? undefined,
      role,
      customerId: role === 'CUSTOMER' ? data.customerId : undefined,
      city: data.city ?? undefined,
      country: data.country ?? undefined,
      addressLine1: data.addressLine1 ?? data.address ?? undefined,
      zipCode: data.zipCode ?? undefined,
      agreeToTerms: data.agreeToTerms,
      marketingOptIn: data.marketingOptIn,
      signupSource: 'web',
      ipAddress: ip,
      userAgent,
      status: 'ACTIVE',
    });
  } catch (err: any) {
    await db.user.delete({ where: { id: user.id } });
    console.error('[signup] register_data_db insert failed', err);
    throw new ConflictError('Failed to save registration. Please try again.');
  }

  // 6. Also insert into legacy logic_details_db (backward compat).
  let registration;
  try {
    registration = insertRegistration({
      userId: user.id,
      fullName: data.fullName,
      email,
      passwordHash,
      phone: data.phone ?? null,
      company: data.company ?? null,
      jobTitle: data.jobTitle ?? null,
      role,
      customerId: role === 'CUSTOMER' ? data.customerId ?? null : null,
      country: data.country ?? null,
      city: data.city ?? null,
      address: data.address ?? null,
      zipCode: data.zipCode ?? null,
      agreeToTerms: data.agreeToTerms,
      marketingOptIn: data.marketingOptIn ?? false,
      signupSource: 'web',
      ipAddress: ip,
      userAgent,
      status: 'ACTIVE',
    });
  } catch (err: any) {
    console.error('[signup] logic_details_db insert failed (non-blocking)', err);
  }

  return NextResponse.json(
    {
      user,
      registerDataId: newRegisterId,
      registration: registration
        ? {
            id: registration.id,
            fullName: registration.fullName,
            email: registration.email,
            role: registration.role,
            createdAt: registration.createdAt,
          }
        : null,
    },
    { status: 201 },
  );
});
