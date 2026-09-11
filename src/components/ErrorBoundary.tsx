import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

/**
 * 路由级错误边界：页面渲染崩溃时兜底为可操作的错误页（回主页/刷新），
 * 避免整棵组件树卸载导致白屏卡死。挂载于 App.tsx 的 Routes 外层，
 * 以 key=pathname 携带，切路由自动复位。
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary] 页面崩溃:', error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="h-full w-full flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-900 p-6 text-center">
          <div className="text-5xl mb-4">⚠️</div>
          <h2 className="text-xl font-bold text-gray-800 dark:text-white mb-2">页面出错了</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">渲染遇到异常，可以返回主页或刷新重试。</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mb-6 max-w-md break-all">{String(this.state.error?.message || '')}</p>
          <div className="flex gap-3">
            <button
              onClick={() => { window.location.hash = '#/main'; window.location.reload() }}
              className="px-5 py-2.5 rounded-lg bg-primary-500 text-white hover:bg-primary-600 transition-colors"
            >
              回到主页
            </button>
            <button
              onClick={() => window.location.reload()}
              className="px-5 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              刷新页面
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
