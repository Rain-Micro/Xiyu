/** @type {import('tailwindcss').Config} */
// 主题：Clay 设计系统（内测版）——暖奶油画布 + 命名色板 + 大圆角 + clay/硬阴影
// 字体替代说明：Roobert 为专有字体不可用，以 Space Grotesk（几何、有个性）替代；
// 其 OpenType stylistic sets 随字体不可迁移，本版以字重/字距/大写标签还原层级个性。
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // 画布与结构
        cream: '#faf9f7',
        oat: {
          DEFAULT: '#dad4c8',
          light: '#eee9df',
        },
        // 暖色中性（重映射 gray → 暖灰，暗色模式随之变暖）
        gray: {
          50: '#faf9f7',
          100: '#f5f4f0',
          200: '#eee9df',
          300: '#e3ded3',
          400: '#c9c3b6',
          500: '#9f9b93',
          600: '#7a766e',
          700: '#55534e',
          800: '#3a3833',
          900: '#26241f',
          950: '#1c1a17',
        },
        // 命名色板
        matcha: {
          300: '#84e7a5',
          600: '#078a52',
          800: '#02492a',
        },
        slushie: {
          500: '#3bd3fd',
          800: '#0089ad',
        },
        lemon: {
          400: '#f8cc65',
          500: '#fbbd41',
          700: '#d08a11',
          800: '#9d6a09',
        },
        ube: {
          300: '#c1b0ff',
          800: '#43089f',
          900: '#32037d',
        },
        pomegranate: {
          400: '#fc7981',
        },
        blueberry: {
          800: '#01418d',
        },
        dragonfruit: {
          DEFAULT: '#e9197f',
        },
        // primary 重映射为 Matcha 系（现有 primary-* 全站用法整体换肤为绿）
        primary: {
          50: '#f2fbf5',
          100: '#dcf5e6',
          200: '#b0e9c9',
          300: '#84e7a5',
          400: '#46c287',
          500: '#078a52',
          600: '#056a41',
          700: '#045335',
          800: '#02492a',
          900: '#01371f',
        },
      },
      borderRadius: {
        // Clay 圆角刻度：卡片 24px、区块 40px（2xl/3xl 全站生效）
        '2xl': '24px',
        '3xl': '40px',
        '4xl': '40px',
      },
      boxShadow: {
        // 签名三层 clay 阴影（含 inset 高光）
        clay: 'rgba(0,0,0,0.1) 0px 1px 1px, rgba(0,0,0,0.04) 0px -1px 1px inset, rgba(0,0,0,0.05) 0px -0.5px 1px',
        // 悬停硬偏移阴影（复古印刷感）
        hard: 'rgb(0,0,0) -7px 7px',
        'hard-sm': 'rgb(0,0,0) -3px 3px',
      },
      fontFamily: {
        sans: ['"Space Grotesk"', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', '"PingFang SC"', '"Hiragino Sans GB"', '"Microsoft YaHei"', 'sans-serif'],
        mono: ['"Space Mono"', 'Consolas', 'monospace'],
      },
      animation: {
        'spin-slow': 'spin 3s linear infinite',
        'bounce-slow': 'bounce 2s infinite',
        'pulse-slow': 'pulse 3s infinite',
        'float': 'float 3s ease-in-out infinite',
        'fade-in': 'fadeIn 0.3s ease-out',
        'fade-out': 'fadeOut 0.3s ease-out',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
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
