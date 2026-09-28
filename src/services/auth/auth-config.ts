// src/services/auth/auth-config.ts — NextAuth v4 configuration.

import type { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { db } from '@/lib/db';
import { verifyPassword } from '@/services/auth/password';
import { RoleEnum } from '@/lib/enums';
import { appConfig } from '@/lib/config';

const SESSION_SECRET = process.env.NEXTAUTH_SECRET;

if (!SESSION_SECRET) {
  throw new Error('NEXTAUTH_SECRET must be set in the environment.');
}

export const authOptions: NextAuthOptions = {
  session: { strategy: 'jwt', maxAge: appConfig.sessionMaxAgeSeconds },
  secret: SESSION_SECRET,
  pages: { signIn: '/' },
  providers: [
    CredentialsProvider({
      name: 'DealFlow360',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;
        const email = credentials.email.trim().toLowerCase();
        const user = await db.user.findUnique({
          where: { email },
          include: { customer: { select: { id: true, name: true, tier: true } } },
        });
        if (!user || !user.active || !user.passwordHash) return null;
        if (!verifyPassword(credentials.password, user.passwordHash)) return null;
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: RoleEnum.parse(user.role),
          customerId: user.customerId ?? undefined,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as any).role;
        token.customerId = (user as any).customerId;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.id;
        (session.user as any).role = token.role;
        (session.user as any).customerId = token.customerId;
      }
      return session;
    },
  },
};
