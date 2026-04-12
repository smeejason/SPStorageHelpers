import { Client } from '@microsoft/microsoft-graph-client'
import { getToken } from '../auth/authService'

let graphClient: Client | null = null

/** Get (or create) a Graph client that auto-attaches the bearer token */
export function getGraphClient(): Client {
  if (!graphClient) {
    graphClient = Client.init({
      authProvider: async (done) => {
        try {
          const token = await getToken()
          done(null, token)
        } catch (err) {
          done(err as Error, null)
        }
      },
    })
  }
  return graphClient
}

/** Reset the client (e.g. after sign-out) */
export function resetGraphClient(): void {
  graphClient = null
}
