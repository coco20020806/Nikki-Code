import { defineConfig, type UserConfigExport } from '@tarojs/cli'

import devConfig from './dev'
import prodConfig from './prod'

export default defineConfig<'webpack5'>(async (merge) => {
  const baseConfig: UserConfigExport<'webpack5'> = {
    projectName: 'NikkiCode',
    date: '2026-11-02',
    designWidth: 750,
    deviceRatio: {
      750: 1,
    },
    sourceRoot: 'src',
    outputRoot: 'dist',
    framework: 'react',
    compiler: 'webpack5',
    cache: { enable: false },
    alias: {
      '@': require('path').resolve(__dirname, '..', 'src'),
    },
    mini: {
      postcss: {
        pxtransform: { enable: true },
        url: { enable: true, config: { limit: 1024 } },
        cssModules: { enable: false },
      },
    },
  }

  return process.env.NODE_ENV === 'development'
    ? merge({}, baseConfig, devConfig)
    : merge({}, baseConfig, prodConfig)
})

