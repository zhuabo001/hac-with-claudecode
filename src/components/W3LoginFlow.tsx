import React, { useEffect, useState } from 'react'
import { Box, Text } from '../ink.js'
import { w3Login } from '../services/w3auth/index.js'
import { saveUserInfo } from '../utils/w3UserInfo.js'
import { Spinner } from './Spinner.js'

type W3LoginState =
	| { state: 'logging_in' }
	| { state: 'success' }
	| { state: 'error'; message: string }

interface W3LoginFlowProps {
	onDone: () => void
}

export function W3LoginFlow({ onDone }: W3LoginFlowProps): React.ReactNode {
	const [loginState, setLoginState] = useState<W3LoginState>({ state: 'logging_in' })

	useEffect(() => {
		const doLogin = async () => {
			try {
				const result = await w3Login()
				saveUserInfo(result)
				setLoginState({ state: 'success' })

				// Show success message briefly before calling onDone
				setTimeout(() => {
					onDone()
				}, 1000)
			} catch (error) {
				const message = error instanceof Error ? error.message : '未知错误'
				setLoginState({ state: 'error', message })
			}
		}

		doLogin()
	}, [])

	if (loginState.state === 'logging_in') {
		return (
			<Box flexDirection="column">
				<Box>
					<Spinner label="正在登录..." />
				</Box>
			</Box>
		)
	}

	if (loginState.state === 'success') {
		return (
			<Box flexDirection="column">
				<Text color="green">✓ 登录成功</Text>
				<Text dimColor>可关闭浏览器页签</Text>
			</Box>
		)
	}

	if (loginState.state === 'error') {
		return (
			<Box flexDirection="column">
				<Text color="red">用户登录失败，失败原因: {loginState.message}</Text>
			</Box>
		)
	}

	return null
}
