import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FlatCompat } from '@eslint/eslintrc';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({ baseDirectory: __dirname });

/**
 * ESLint 설정
 *
 * TECH_SPEC §7.2: 업로드 문서·검증 결과를 영구 저장하지 않는다는 요구를
 * no-restricted-globals 규칙으로 코드 레벨에서 강제한다.
 */
const eslintConfig = [
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    ignores: ['.next/**', 'node_modules/**', 'out/**', 'next-env.d.ts'],
  },
  {
    rules: {
      'no-restricted-globals': [
        'error',
        {
          name: 'localStorage',
          message: 'PRD 보안 요구 2항: 업로드 문서와 검증 결과는 저장할 수 없습니다. 메모리 상태만 사용하세요.',
        },
        {
          name: 'sessionStorage',
          message: 'PRD 보안 요구 2항: 업로드 문서와 검증 결과는 저장할 수 없습니다. 메모리 상태만 사용하세요.',
        },
        {
          name: 'indexedDB',
          message: 'PRD 보안 요구 2항: 업로드 문서와 검증 결과는 저장할 수 없습니다. 메모리 상태만 사용하세요.',
        },
      ],
      'no-restricted-properties': [
        'error',
        { object: 'window', property: 'localStorage', message: 'PRD 보안 요구 2항: 브라우저 스토리지를 사용할 수 없습니다.' },
        { object: 'window', property: 'sessionStorage', message: 'PRD 보안 요구 2항: 브라우저 스토리지를 사용할 수 없습니다.' },
        { object: 'window', property: 'indexedDB', message: 'PRD 보안 요구 2항: 브라우저 스토리지를 사용할 수 없습니다.' },
      ],
    },
  },
];

export default eslintConfig;
