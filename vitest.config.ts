import { defineConfig, Plugin } from 'vitest/config';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

/**
 * Minimal Vite plugin that inlines Angular templateUrl and styleUrl references
 * during test compilation, so Angular JIT can compile components without a
 * separate HTTP-based resource resolution step.
 */
function angularInlineTemplates(): Plugin {
  return {
    name: 'angular-inline-templates',
    transform(code: string, id: string) {
      if (!id.endsWith('.ts') || id.endsWith('.spec.ts') || id.endsWith('.d.ts')) {
        return null;
      }
      if (!code.includes('templateUrl') && !code.includes('styleUrl')) {
        return null;
      }

      const dir = dirname(id);
      let transformed = code;

      // Replace templateUrl: './foo.html' with template: `<file contents>`
      transformed = transformed.replace(
        /templateUrl\s*:\s*(['"`])([^'"`]+)\1/g,
        (_match: string, _quote: string, url: string) => {
          const filePath = resolve(dir, url);
          if (existsSync(filePath)) {
            const content = readFileSync(filePath, 'utf-8')
              .replace(/\\/g, '\\\\')
              .replace(/`/g, '\\`')
              .replace(/\$\{/g, '\\${');
            return `template: \`${content}\``;
          }
          return `template: ''`;
        }
      );

      // Replace styleUrl: './foo.scss' with styles: ['']
      transformed = transformed.replace(
        /styleUrl\s*:\s*(['"`])[^'"`]+\1/g,
        `styles: ['']`
      );

      // Replace styleUrls: ['./foo.scss'] with styles: ['']
      transformed = transformed.replace(
        /styleUrls\s*:\s*\[[^\]]*\]/g,
        `styles: ['']`
      );

      return { code: transformed, map: null };
    },
  };
}

export default defineConfig({
  plugins: [angularInlineTemplates()],
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.spec.ts'],
    setupFiles: [
      'zone.js',
      'src/test-setup.ts',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/app/**/*.ts'],
      exclude: ['src/app/**/*.spec.ts', 'src/app/**/*.d.ts'],
    },
  },
});
