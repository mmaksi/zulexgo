import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/**
 * `external-services`: a vendor SDK may be imported in exactly one folder, and
 * nothing outside the composition root may depend on a concrete adapter.
 * `project-structure`: dependencies point inward. A rule beats a convention.
 */
const VENDOR_SDKS = [
  { name: "stripe", message: "Import the PaymentProvider port; Stripe lives in src/adapters/payment/stripe/." },
  { name: "pg", message: "Import the ApplicationRepository port; Postgres lives in src/adapters/repository/postgres/." },
  { name: "resend", message: "Import the Mailer port; Resend lives in src/adapters/mail/resend/." },
];

const VENDOR_SDK_PATTERNS = [
  { group: ["@supabase/*"], message: "Import the DocumentStore port; Supabase lives in src/adapters/storage/supabase/." },
];

const CONCRETE_ADAPTERS = {
  group: ["@/src/adapters/*", "@/src/adapters/**"],
  message: "Depend on a port from src/core/ports/. Adapters are chosen in src/config/container.ts and nowhere else.",
};

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
    files: ["src/core/**/*.ts"],
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
      "no-restricted-imports": ["error", {
        paths: [
          ...VENDOR_SDKS,
          { name: "next", message: "src/core/ is framework-free. Move framework code to app/." },
          { name: "react", message: "src/core/ is framework-free. Move component code to src/ui/ or app/." },
          { name: "react-dom", message: "src/core/ is framework-free." },
        ],
        patterns: [
          ...VENDOR_SDK_PATTERNS,
          { group: ["next/*"], message: "src/core/ is framework-free. Move framework code to app/." },
          CONCRETE_ADAPTERS,
          {
            group: ["@/app/*", "@/app/**", "@/src/ui/*", "@/src/ui/**", "@/src/config/*", "@/src/config/**"],
            message: "Dependencies point inward: src/core/ may not import the framework, the UI, or the composition root.",
          },
        ],
      }],
    },
  },
  {
    files: ["app/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", {
        paths: VENDOR_SDKS,
        patterns: [...VENDOR_SDK_PATTERNS, CONCRETE_ADAPTERS],
      }],
    },
  },
  {
    files: ["src/adapters/**/*.ts"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [{
          group: ["@/app/*", "@/app/**", "@/src/ui/*", "@/src/ui/**"],
          message: "An adapter is an outside-world detail; it may not reach into the framework or the UI.",
        }],
      }],
    },
  },
  {
    files: ["src/ui/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", {
        paths: VENDOR_SDKS,
        patterns: [
          ...VENDOR_SDK_PATTERNS,
          CONCRETE_ADAPTERS,
          { group: ["@/src/core/use-cases/*", "@/src/core/use-cases/**"], message: "Design-system components render; they do not run business operations." },
        ],
      }],
    },
  },
]);

export default eslintConfig;
