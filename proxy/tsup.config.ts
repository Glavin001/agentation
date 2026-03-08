import { defineConfig } from "tsup";
import * as sass from "sass";
import postcss from "postcss";
import postcssModules from "postcss-modules";
import * as path from "path";
import type { Plugin } from "esbuild";

function scssModulesPlugin(): Plugin {
  return {
    name: "scss-modules",
    setup(build) {
      build.onLoad({ filter: /\.scss$/ }, async (args) => {
        const isModule = args.path.includes(".module.");
        const parentDir = path.basename(path.dirname(args.path));
        const baseName = path.basename(
          args.path,
          isModule ? ".module.scss" : ".scss",
        );
        const styleId = `${parentDir}-${baseName}`;

        const result = sass.compile(args.path);
        let css = result.css;

        if (isModule) {
          let classNames: Record<string, string> = {};
          const postcssResult = await postcss([
            postcssModules({
              getJSON(_cssFileName: string, json: Record<string, string>) {
                classNames = json;
              },
              generateScopedName: "[name]__[local]___[hash:base64:5]",
            }),
          ]).process(css, { from: args.path });

          css = postcssResult.css;

          const contents = `
const css = ${JSON.stringify(css)};
const classNames = ${JSON.stringify(classNames)};
if (typeof document !== 'undefined') {
  let style = document.getElementById('feedback-tool-styles-${styleId}');
  if (!style) {
    style = document.createElement('style');
    style.id = 'feedback-tool-styles-${styleId}';
    style.textContent = css;
    document.head.appendChild(style);
  }
}
export default classNames;
`;
          return { contents, loader: "js" };
        } else {
          const contents = `
const css = ${JSON.stringify(css)};
if (typeof document !== 'undefined') {
  let style = document.getElementById('feedback-tool-styles-${styleId}');
  if (!style) {
    style = document.createElement('style');
    style.id = 'feedback-tool-styles-${styleId}';
    style.textContent = css;
    document.head.appendChild(style);
  }
}
export default {};
`;
          return { contents, loader: "js" };
        }
      });
    },
  };
}

export default defineConfig([
  // Standalone IIFE bundle (browser) - bundles React + ReactDOM + Agentation
  {
    entry: { standalone: "src/standalone.tsx" },
    format: ["iife"],
    globalName: "__agentation",
    platform: "browser",
    noExternal: [/.*/],
    splitting: false,
    sourcemap: false,
    clean: true,
    minify: true,
    esbuildPlugins: [scssModulesPlugin()],
    esbuildOptions(options) {
      options.jsx = "automatic";
    },
  },
  // Server library export
  {
    entry: ["src/index.ts"],
    format: ["cjs", "esm"],
    dts: true,
    splitting: false,
    sourcemap: true,
    clean: false,
    external: ["agentation", "react", "react-dom"],
  },
  // CLI
  {
    entry: ["src/cli.ts"],
    format: ["cjs"],
    dts: false,
    splitting: false,
    sourcemap: true,
    clean: false,
    external: ["agentation", "react", "react-dom"],
    banner: {
      js: "#!/usr/bin/env node",
    },
  },
]);
