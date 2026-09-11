/** @type {import('tailwindcss').Config} */
// 主题：Soft UI Evolution（DESIGN.md）——柔和粉彩色板 + 改进阴影（柔和但不失层次）+
// 现代过渡（200-300ms）+ 焦点可见（WCAG AA+）+ 全暗色模式。
// 上一版（Clay）问题：大绿大紫色相冲突、点击倾斜动画过激——本版全部移除。
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // 中性画布（微冷调白，衬托粉彩）
        canvas: '#f7f9fc',
        surface: '#ffffff',
        // 柔和粉彩主色
        softblue: {
          50: '#f0f9ff',
          100: '#e0f2fe',
          200: '#c5e7f5',
          300: '#a8dcf0',
          DEFAULT: '#87CEEB', // Soft Blue
          500: '#5ab8dd',
          600: '#3d9fc7',
          700: '#2e7ea0',
          800: '#266a84',
          900: '#1f566c',
        },
        softpink: {
          100: '#ffedef',
          200: '#ffdbe0',
          DEFAULT: '#FFB6C1', // Soft Pink
          400: '#ff9aa9',
          500: '#f97b8e',
          600: '#e05c72',
        },
        softgreen: {
          100: '#e6f9e6',
          200: '#ccf2cc',
          DEFAULT: '#90EE90', // Soft Green
          400: '#6fd66f',
          500: '#4cbb4c',
          600: '#3a9e3a',
          700: '#2f7d2f',
        },
        // 强调/语义
        info: '#5ab8dd',
        success: '#4cbb4c',
        warn: '#f0b429',
        danger: '#e06c75',
        // 暖中性（文字/边框），冷调但不发灰
        gray: {
          50: '#f8fafc',
          100: '#f1f5f9',
          200: '#e6ebf1',
          300: '#d5dde5',
          400: '#9aa7b4',
          500: '#6b7a8a',
          600: '#4e5c6b',
          700: '#3a4652',
          800: '#2a333d',
          900: '#1c232b',
          950: '#141a20',
        },
        // primary 映射 Soft Blue 系（现有 primary-* 全站用法整体换肤为柔蓝）
        primary: {
          50: '#f0f9ff',
          100: '#e0f2fe',
          200: '#c5e7f5',
          300: '#a8dcf0',
          400: '#87CEEB',
          500: '#5ab8dd',
          600: '#3d9fc7',
          700: '#2e7ea0',
          800: '#266a84',
          900: '#1f566c',
        },
      },
      borderRadius: {
        // Soft UI：适中圆角（卡片 16px、控件 12px），不追 Clay 的 24-40px
        xl: '12px',
        '2xl': '16px',
        '3xl': '24px',
      },
      boxShadow: {
        // 改进阴影：比 flat 柔和、比拟物清晰——低模糊 + 轻投影 + 微高光
        soft: '0 2px 8px rgba(30, 60, 90, 0.06), 0 1px 2px rgba(30, 60, 90, 0.04)',
        'soft-md': '0 4px 14px rgba(30, 60, 90, 0.08), 0 2px 4px rgba(30, 60, 90, 0.04)',
        'soft-lg': '0 8px 24px rgba(30, 60, 90, 0.10), 0 4px 8px rgba(30, 60, 90, 0.05)',
      },
      fontFamily: {
        sans: ['"Space Grotesk"', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', '"PingFang SC"', '"Hiragino Sans GB"', '"Microsoft YaHei"', 'sans-serif'],
        mono: ['"Space Mono"', 'Consolas', 'monospace'],
      },
      transitionDuration: {
        DEFAULT: '250ms', // Soft UI 现代过渡 200-300ms
      },
      animation: {
        'spin-slow': 'spin 3s linear infinite',
        'bounce-slow': 'bounce 2s infinite',
        'pulse-slow': 'pulse 3s infinite',
        'fade-in': 'fadeIn 0.25s ease-out',
        'fade-out': 'fadeOut 0.25s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        fadeOut: {
          '0%': { opacity: '1' },
          '100%': { opacity: '0' },
        },
      }
    },
  },
  plugins: [],
}
