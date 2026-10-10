import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// no-restricted-imports does not merge across blocks (the last match wins): build each with restrict().
const VENDORS = [
  { sdks: [{ name: "stripe" }], folder: "src/adapters/payment/stripe", port: "PaymentProvider" },
  { sdks: [{ name: "pg" }], folder: "src/adapters/repository/postgres", port: "ApplicationRepository" },
  { sdks: [{ name: "resend" }, { name: "react-email" }], folder: "src/adapters/mail/resend", port: "Mailer" },
  { sdks: [{ group: ["@supabase/*"] }], folder: "src/adapters/storage/supabase", port: "DocumentStore" },
].map((vendor) => ({
  ...vendor,
  sdks: vendor.sdks.map((sdk) => ({ ...sdk, message: `Import the ${vendor.port} port; the SDK lives in ${vendor.folder}/ only.` })),
}));

const STRIPE_UI_FOLDER = "app/(funnel)/_components/stripe";
const STRIPE_UI = {
  group: ["@stripe/*"],
  message: `Stripe's browser SDK lives in ${STRIPE_UI_FOLDER}/ only.`,
};

const PARENT_IMPORTS = {
  regex: "^\\.\\./",
  message: "Import across folders through @/ so the dependency rules can see it.",
};

const RAW_CN = { name: "cn", message: "Import cn from @/src/lib/utils, which knows the theme tokens." };

const CONCRETE_ADAPTERS = {
  group: ["@/src/adapters/*", "@/src/adapters/**"],
  message: "Depend on a port from src/core/ports/. Adapters are chosen in src/config/container.ts and nowhere else.",
};

function restrict({ paths = [], patterns = [], allowSdk, allowStripeUi = false } = {}) {
  const sdks = VENDORS.filter((vendor) => vendor !== allowSdk).flatMap((vendor) => vendor.sdks);
  return ["error", {
    paths: [...sdks.filter((sdk) => sdk.name), ...paths],
    patterns: [...sdks.filter((sdk) => sdk.group), ...(allowStripeUi ? [] : [STRIPE_UI]), PARENT_IMPORTS, ...patterns],
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
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "coverage/**",
  ]),
  {
    files: ["**/*.{ts,tsx}"],
    rules: { "no-restricted-imports": restrict() },
  },
  {
    files: ["src/core/**/*.{ts,tsx}"],
    rules: {
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
    files: ["app/**/*.{ts,tsx}", "src/ui/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": ["error", {
        selector: "CallExpression[callee.property.name='reveal']",
        message: "Only an adapter reveals a Secret, to send or store it. The funnel passes what the customer typed on as a plain string.",
      }],
    },
  },
  {
    files: [`${STRIPE_UI_FOLDER}/**/*.{ts,tsx}`],
    rules: {
      "no-restricted-imports": restrict({ paths: [RAW_CN], patterns: [CONCRETE_ADAPTERS], allowStripeUi: true }),
    },
  },
  {
    files: ["src/adapters/**/*.{ts,tsx}"],
    rules: { "no-restricted-imports": restrict({ patterns: ADAPTER_PATTERNS }) },
  },
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
