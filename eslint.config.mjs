import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/**
 * `external-services`: a vendor SDK may be imported in exactly one folder, and
 * nothing outside the composition root may depend on a concrete adapter.
 * `project-structure`: dependencies point inward. A rule beats a convention.
 *
 * `no-restricted-imports` does not merge across config blocks — the last block
 * matching a file wins — so every block is built with `restrict()`, which
 * always carries the vendor and parent-import bans.
 */
const VENDORS = [
  { sdk: { name: "stripe" }, folder: "src/adapters/payment/stripe", port: "PaymentProvider" },
  { sdk: { name: "pg" }, folder: "src/adapters/repository/postgres", port: "ApplicationRepository" },
  { sdk: { name: "resend" }, folder: "src/adapters/mail/resend", port: "Mailer" },
  { sdk: { group: ["@supabase/*"] }, folder: "src/adapters/storage/supabase", port: "DocumentStore" },
].map((vendor) => ({
  ...vendor,
  sdk: { ...vendor.sdk, message: `Import the ${vendor.port} port; the SDK lives in ${vendor.folder}/ only.` },
}));

// A relative path climbing out of its folder would slip past every alias-based
// pattern below, so cross-folder imports must go through `@/`.
const PARENT_IMPORTS = {
  regex: "^\\.\\./",
  message: "Import across folders through @/ so the dependency rules can see it.",
};

// The bare package does not know the globals.css type scale and drops `text-h4`
// next to a text colour; src/lib/utils.ts registers the tokens.
const RAW_CN = { name: "cn", message: "Import cn from @/src/lib/utils, which knows the theme tokens." };

const CONCRETE_ADAPTERS = {
  group: ["@/src/adapters/*", "@/src/adapters/**"],
  message: "Depend on a port from src/core/ports/. Adapters are chosen in src/config/container.ts and nowhere else.",
};

function restrict({ paths = [], patterns = [], allowSdk } = {}) {
  const sdks = VENDORS.filter((vendor) => vendor !== allowSdk).map((vendor) => vendor.sdk);
  return ["error", {
    paths: [...sdks.filter((sdk) => sdk.name), ...paths],
    patterns: [...sdks.filter((sdk) => sdk.group), PARENT_IMPORTS, ...patterns],
  }];
}

const ADAPTER_PATTERNS = [
  {
    group: ["@/app/*", "@/app/**", "@/src/ui/*", "@/src/ui/**", "@/src/config/*", "@/src/config/**"],
    message: "An adapter is an outside-world detail; it may not reach into the framework, the UI, or the composition root.",
  },
  {
    ...CONCRETE_ADAPTERS,
    message: "An adapter never depends on another adapter. Import siblings in your own folder with ./",
  },
];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Jest coverage output.
    "coverage/**",
  ]),
  {
    files: ["**/*.{ts,tsx}"],
    rules: { "no-restricted-imports": restrict() },
  },
  {
    files: ["src/core/**/*.{ts,tsx}"],
    rules: {
      // Non-determinism arrives through the Clock and TokenGenerator ports, never
      // by reaching for it. Parsing a stored instant with `new Date(value)` is
      // fine; it is the zero-argument call that reads the wall clock.
      "no-restricted-syntax": ["error",
        {
          selector: "NewExpression[callee.name='Date'][arguments.length=0]",
          message: "Take the current time from the Clock port, so expiry and backoff stay testable.",
        },
        {
          selector: "MemberExpression[object.name='Date'][property.name='now']",
          message: "Take the current time from the Clock port, so expiry and backoff stay testable.",
        },
        {
          selector: "MemberExpression[object.name='Math'][property.name='random']",
          message: "Take randomness from the TokenGenerator port; Math.random is not a CSPRNG.",
        },
      ],
      "no-restricted-imports": restrict({
        paths: [
          { name: "next", message: "src/core/ is framework-free. Move framework code to app/." },
          { name: "react", message: "src/core/ is framework-free. Move component code to src/ui/ or app/." },
          { name: "react-dom", message: "src/core/ is framework-free." },
        ],
        patterns: [
          { group: ["next/*"], message: "src/core/ is framework-free. Move framework code to app/." },
          CONCRETE_ADAPTERS,
          {
            group: ["@/app/*", "@/app/**", "@/src/ui/*", "@/src/ui/**", "@/src/config/*", "@/src/config/**"],
            message: "Dependencies point inward: src/core/ may not import the framework, the UI, or the composition root.",
          },
        ],
      }),
    },
  },
  {
    files: ["app/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": restrict({ paths: [RAW_CN], patterns: [CONCRETE_ADAPTERS] }),
    },
  },
  {
    files: ["src/adapters/**/*.{ts,tsx}"],
    rules: { "no-restricted-imports": restrict({ patterns: ADAPTER_PATTERNS }) },
  },
  // Each vendor SDK is importable in its own adapter folder and nowhere else.
  ...VENDORS.map((vendor) => ({
    files: [`${vendor.folder}/**/*.{ts,tsx}`],
    rules: { "no-restricted-imports": restrict({ patterns: ADAPTER_PATTERNS, allowSdk: vendor }) },
  })),
  {
    files: ["src/ui/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": restrict({
        paths: [RAW_CN],
        patterns: [
          CONCRETE_ADAPTERS,
          { group: ["@/src/core/use-cases/*", "@/src/core/use-cases/**"], message: "Design-system components render; they do not run business operations." },
        ],
      }),
    },
  },
]);

export default eslintConfig;
