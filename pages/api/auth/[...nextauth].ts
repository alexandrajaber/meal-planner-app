import NextAuth from 'next-auth'
import GoogleProvider from 'next-auth/providers/google'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export default NextAuth({
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: 'openid email profile https://www.googleapis.com/auth/calendar.readonly',
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    }),
  ],
  callbacks: {
    async jwt({ token, account, user }) {
      if (account && user?.email) {
        token.accessToken = account.access_token
        token.refreshToken = account.refresh_token
        
        // Save tokens to Supabase for shared access
        try {
          const expiresIn: number = (account.expires_in as number) ?? 3600
          const expiresAt = new Date(Date.now() + expiresIn * 1000)
          
          // Check if token already exists for this user
          const { data: existing } = await supabase
            .from('calendar_tokens')
            .select('id')
            .eq('user_email', user.email)
            .single()
          
          if (existing) {
            // Update existing token
            await supabase
              .from('calendar_tokens')
              .update({
                access_token: account.access_token,
                refresh_token: account.refresh_token || null,
                expires_at: expiresAt.toISOString(),
                updated_at: new Date().toISOString()
              })
              .eq('user_email', user.email)
          } else {
            // Insert new token
            await supabase
              .from('calendar_tokens')
              .insert([{
                user_email: user.email,
                access_token: account.access_token,
                refresh_token: account.refresh_token || null,
                expires_at: expiresAt.toISOString()
              }])
          }
        } catch (error) {
          console.error('Error saving calendar token to Supabase:', error)
        }
      }
      return token
    },
    async session({ session, token }) {
      if (token.accessToken) {
        session.accessToken = token.accessToken as string
      }
      return session
    },
  },
  pages: {
    signIn: '/',
    error: '/',
  },
  secret: process.env.NEXTAUTH_SECRET,
})
