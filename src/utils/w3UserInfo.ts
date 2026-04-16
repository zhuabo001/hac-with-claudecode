import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

interface UserInfo {
	cookie: string
	token: string
}

/**
 * Get the path to the user info file
 * Returns ~/.cache/freecode/.userinfo.json on Unix-like systems
 * Returns C:/Users/{user_id}/.cache/freecode/.userinfo.json on Windows
 */
export function getUserInfoPath(): string {
	const home = homedir()
	const cacheDir = process.platform === 'win32'
		? join(home, '.cache', 'freecode')
		: join(home, '.cache', 'freecode')
	return join(cacheDir, '.userinfo.json')
}

/**
 * Read user info from the file
 * Returns null if file doesn't exist or has invalid format
 */
export function getUserInfo(): UserInfo | null {
	const filePath = getUserInfoPath()

	if (!existsSync(filePath)) {
		return null
	}

	try {
		const content = readFileSync(filePath, 'utf-8')
		const data = JSON.parse(content)

		if (typeof data.cookie === 'string' && typeof data.token === 'string') {
			return data
		}

		return null
	} catch {
		return null
	}
}

/**
 * Save user info to the file
 * Creates the directory if it doesn't exist
 */
export function saveUserInfo(data: UserInfo): void {
	const filePath = getUserInfoPath()
	const dir = join(filePath, '..')

	mkdirSync(dir, { recursive: true })
	writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8')
}

/**
 * Check if valid user info exists
 */
export function hasValidUserInfo(): boolean {
	const info = getUserInfo()
	return info !== null && !!info.cookie && !!info.token
}
