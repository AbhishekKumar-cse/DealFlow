// src/app/api/auth/[...nextauth]/route.ts — NextAuth v4 mount.

import NextAuth from 'next-auth';
import { authOptions } from '@/services/auth/auth-config';

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
