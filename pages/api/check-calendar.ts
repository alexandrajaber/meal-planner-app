import type { NextApiRequest, NextApiResponse } from 'next'
import { getServerSession } from 'next-auth/next'
import { google } from 'googleapis'
import GoogleProvider from 'next-auth/providers/google'

const authOptions = {
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
    async jwt({ token, account }: any) {
      if (account) {
        token.accessToken = account.access_token
        token.refreshToken = account.refresh_token
      }
      return token
    },
    async session({ session, token }: any) {
      if (token.accessToken) {
        session.accessToken = token.accessToken as string
      }
      return session
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const session = await getServerSession(req, res, authOptions)
  
  if (!session || !session.accessToken) {
    return res.status(401).json({ error: 'Not authenticated' })
  }

  const { startDate, endDate } = req.body

  try {
    const oauth2Client = new google.auth.OAuth2()
    oauth2Client.setCredentials({ access_token: session.accessToken })

    const calendar = google.calendar({ version: 'v3', auth: oauth2Client })

    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin: new Date(startDate).toISOString(),
      timeMax: new Date(endDate).toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
    })

    const events = response.data.items || []
    
    // Look for events where BOTH people are away
    // Format: "Holiday: [Location]" = both away
    // Format: "Holiday Alex: [Location]" or "Holiday Tony: [Location]" = one person away (still cook)
    const awayDays = new Set<string>()

    events.forEach(event => {
      const title = (event.summary || '').trim()
      
      // Check if this is a holiday event where BOTH are away
      // Matches: "Holiday:", "holiday:", "HOLIDAY:"
      // Does NOT match: "Holiday Alex:", "Holiday Tony:"
      const bothAwayPattern = /^holiday:\s*/i
      const isBothAway = bothAwayPattern.test(title)

      if (isBothAway && event.start) {
        const eventDate = event.start.date || event.start.dateTime
        if (eventDate) {
          const date = new Date(eventDate).toISOString().split('T')[0]
          awayDays.add(date)
        }
      }
    })

    res.status(200).json({ awayDays: Array.from(awayDays) })
  } catch (error) {
    console.error('Calendar API error:', error)
    res.status(500).json({ error: 'Failed to fetch calendar' })
  }
}
