import React, { useEffect, useState } from 'react'
import { Box, Text } from '../ink.js'
import { useInput } from 'ink'
import { w3Login } from '../services/w3auth/index.js'
import { saveUserInfo } from '../utils/w3UserInfo.js'
import { Spinner } from './Spinner.js'

type W3LoginState =
	| { state: 'idle' }
	| { state: 'logging_in' }
	| { state: 'success' }
	| { state: 'error'; message: string }

interface W3LoginFlowProps {
	onDone: () => void
}

export function W3LoginFlow({ onDone }: W3LoginFlowProps): React.ReactNode {
	const [loginState, setLoginState] = useState<W3LoginState>({ state: 'idle' })
	const [isSelected, setIsSelected] = useState(true)

	useInput((input, key) => {
		if (input.toLowerCase() === 'q') {
			process.exit(0)
		}

		if (key.return && loginState.state === 'idle' && isSelected) {
			handleLogin()
		}
	})

	const handleLogin = async () => {
		setLoginState({ state: 'logging_in' })

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

	// Auto-start login when component mounts
	useEffect(() => {
		if (loginState.state === 'idle') {
			handleLogin()
		}
	}, [])

	if (loginState.state === 'idle') {
		return (
			<Box flexDirection="column">
				<Box>
					<Text color="cyan">{isSelected ? '> ' : '  '}w3登录</Text>
				</Box>
				<Box marginTop={1}>
					<Text dimColor>按 Q 取消</Text>
				</Box>
			</Box>
		)
	}

	if (loginState.state === 'logging_in') {
		return (
			<Box flexDirection="column">
				<Box>
					<Spinner label="正在登录..." />
				</Box>
				<Box marginTop={1}>
					<Text dimColor>按 Q 取消</Text>
				</Box>
			</Box>
		)
	}

	if (loginState.state === 'success') {
		return (
			<Box>
				<Text color="green">✓ 登录成功</Text>
			</Box>
		)
	}

	if (loginState.state === 'error') {
		return (
			<Box flexDirection="column">
				<Text color="red">用户登录失败，失败原因: {loginState.message}</Text>
				<Box marginTop={1}>
					<Text dimColor>按 Q 退出</Text>
				</Box>
			</Box>
		)
	}

	return null
}
