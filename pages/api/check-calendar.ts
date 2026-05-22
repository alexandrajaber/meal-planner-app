import type { NextApiRequest, NextApiResponse } from 'next'
import { google } from 'googleapis'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { startDate, endDate } = req.body

  try {
    // Get the most recent calendar token from Supabase
    const { data: tokenData, error: tokenError } = await supabase
      .from('calendar_tokens')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(1)
      .single()
    
    if (tokenError || !tokenData) {
      // No calendar connected - return empty away days
      return res.status(200).json({ awayDays: [] })
    }

    const oauth2Client = new google.auth.OAuth2()
    oauth2Client.setCredentials({ access_token: tokenData.access_token })

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
    // Format: "Holiday Alex:" or "Holiday Tony:" = one person away (still cook)
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
    // If calendar check fails, return empty array instead of erroring
    res.status(200).json({ awayDays: [] })
  }
}
