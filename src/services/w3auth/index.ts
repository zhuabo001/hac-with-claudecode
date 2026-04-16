import { randomUUID } from 'crypto'

// URL constants
const W3_LOGIN_BASE = 'https://www.loginw3.hw.rnd.com/'
const HAC_API_BASE = 'https://www.hac-y.hw.rnd.com/api/v1'
const SSO_VERIFY_TOKEN_URL = 'https://www.hac-y.hw.rnd.com/api/v1/verify-token'

/**
 * Generate a unique session ID for the login flow
 */
export function generateSessionId(): string {
	return randomUUID()
}

/**
 * Build the W3 login URL with redirect to set-cookie endpoint
 */
export function buildW3LoginUrl(sessionId: string): string {
	const setSessionUrl = `${HAC_API_BASE}/set-cookie/${sessionId}`
	return `${W3_LOGIN_BASE}?redirect=${encodeURIComponent(setSessionUrl)}`
}

/**
 * Fetch cookie from the backend using session ID
 * Throws error if cookie is not available
 */
export async function fetchCookie(sessionId: string): Promise<string> {
	const res = await fetch(`${HAC_API_BASE}/get-cookie/${sessionId}`)

	if (!res.ok) {
		throw new Error(`获取cookie失败: HTTP ${res.status}`)
	}

	const data = await res.json()

	if (!data.cookie) {
		throw new Error('服务端未返回cookie，请确认是否已在浏览器完成登录')
	}

	return data.cookie
}

/**
 * Verify token using the cookie
 */
export async function verifyToken(cookie: string): Promise<string> {
	const res = await fetch(SSO_VERIFY_TOKEN_URL, {
		headers: { Cookie: cookie }
	})

	if (!res.ok) {
		throw new Error(`Token验证失败: HTTP ${res.status}`)
	}

	const data = await res.json()
	return data.token
}

/**
 * Poll for cookie with timeout
 * Polls every 2 seconds for up to 120 seconds
 */
async function pollForCookie(sessionId: string): Promise<string> {
	const maxAttempts = 60 // 120 seconds / 2 seconds per attempt
	const pollInterval = 2000 // 2 seconds

	for (let attempt = 0; attempt < maxAttempts; attempt++) {
		try {
			const cookie = await fetchCookie(sessionId)
			return cookie
		} catch (error) {
			// If it's the last attempt, throw the error
			if (attempt === maxAttempts - 1) {
				throw new Error('登录超时，请重试')
			}

			// Wait before next attempt
			await new Promise(resolve => setTimeout(resolve, pollInterval))
		}
	}

	throw new Error('登录超时，请重试')
}

/**
 * Complete W3 login flow
 * Opens browser, waits for user to complete login, fetches cookie and verifies token
 */
export async function w3Login(): Promise<{ cookie: string; token: string }> {
	const sessionId = generateSessionId()
	const loginUrl = buildW3LoginUrl(sessionId)

	const { openBrowser } = await import('../../utils/browser.js')
	const opened = await openBrowser(loginUrl)

	if (!opened) {
		throw new Error('无法打开浏览器，请手动访问登录页面')
	}

	// Poll for cookie after user completes login in browser
	const cookie = await pollForCookie(sessionId)
	const token = await verifyToken(cookie)

	return { cookie, token }
}
