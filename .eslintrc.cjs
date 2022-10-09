module.exports = {
  'env': {
    'node': true,
    'es2021': true,
  },
  'extends': 'google',
  'overrides': [
  ],
  'parserOptions': {
    'ecmaVersion': 'latest',
    'sourceType': 'module',
  },
  'rules': {
    'quotes': ['error', 'single'],
    'semi': ['error', 'always'],
    'indent': ['error', 2],
    'no-multi-spaces': ['error'],
    'max-len': ['off'],
    'require-jsdoc': ['off'],
  },
};
