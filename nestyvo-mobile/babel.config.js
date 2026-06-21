module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ['babel-preset-expo', { jsxImportSource: 'nativewind' }],
      'nativewind/babel',
    ],
    plugins: [
      // Reanimated plugin must be last — only on native, web doesn't need worklets
      ...(process.env.EXPO_TARGET === 'web' ? [] : ['react-native-reanimated/plugin']),
    ],
  };
};
