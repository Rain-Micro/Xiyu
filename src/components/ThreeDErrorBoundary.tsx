import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

interface Props {
  children: ReactNode
  /** 自定义错误回退渲染 */
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

/**
 * 3D 模型加载错误边界
 * 捕获 ThreeDViewer 内部的渲染错误，防止整个界面卡死
 */
export default class ThreeDErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ThreeDErrorBoundary] 捕获到错误:', error, errorInfo)
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback

      return (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/10 dark:bg-black/20">
          <div className="flex flex-col items-center gap-3 px-4 py-6 bg-white dark:bg-gray-800 rounded-xl shadow-lg max-w-[240px] text-center">
            <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
              <AlertTriangle className="w-6 h-6 text-red-500" />
            </div>
            <p className="text-xs text-gray-600 dark:text-gray-300">
              3D 渲染出错，请重试或更换模型文件
            </p>
            <button
              onClick={this.handleRetry}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-primary-500 hover:bg-primary-600 rounded-lg transition-colors"
            >
              <RefreshCw className="w-3 h-3" />
              重试
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
