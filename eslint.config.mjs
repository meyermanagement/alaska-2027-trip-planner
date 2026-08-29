import js from "@eslint/js";
import globals from "globals";

/**
 * One rule, for one bug.
 *
 * `next build` compiles a name that does not exist. A page that reads
 * `family.id` where only `familyId` was ever declared builds clean, deploys
 * clean, answers a health check on a public route clean, and then throws a
 * ReferenceError the first time somebody signs in and asks for that screen --
 * which is how the Trips page, the one everybody lands on, was broken for a
 * while by a rename that missed one line out of four.
 *
 * So this config is deliberately not a style opinion. It is `no-undef` and the
 * handful of rules that catch the same shape of mistake: a name that is not
 * there, a variable used before it exists, a promise nobody waited for. Anything
 * about formatting belongs to Prettier, and anything about taste belongs in
 * review.
 */
export default [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "public/**",
      "supabase/**",
      "*.config.mjs",
      "*.config.js",
    ],
  },
  {
    files: ["**/*.{js,jsx,mjs}"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
      globals: {
        ...globals.browser,
        ...globals.node,
        // Next's own runtime globals, and the JSX pragma React 19 does not need
        // imported but the parser still sees referenced in compiled output.
        React: "readonly",
      },
    },
    linterOptions: {
      // Inline comments are ignored, so no file can switch this rule off and
      // quietly stop being checked. The existing `exhaustive-deps` and
      // `no-img-element` comments still say what they were for; those rules
      // live in plugins this config does not load, so honoring them was never
      // on the table -- and with directives ignored rather than validated, they
      // no longer report as unknown rules either.
      noInlineConfig: true,
      reportUnusedDisableDirectives: "off",
    },
    rules: {
      ...js.configs.recommended.rules,

      // The one that matters. Everything else here is either the same class of
      // error or off.
      "no-undef": "error",
      // Functions and module-level constants both hoist in ways that make this
      // rule shout about code that is fine: a helper near the top of a file
      // reading a table defined at the bottom is a normal way to write a
      // module, and nothing reads it until something calls the helper. Classes
      // genuinely do not hoist, so those stay an error.
      "no-use-before-define": [
        "error",
        { functions: false, classes: true, variables: false },
      ],
      "no-const-assign": "error",
      "no-dupe-keys": "error",
      "no-dupe-args": "error",
      "no-dupe-class-members": "error",
      "no-unreachable": "error",
      "no-self-assign": "error",
      "no-self-compare": "error",
      "no-constant-condition": ["error", { checkLoops: false }],
      "require-atomic-updates": "off",

      // Not this rule's job. An unused import is untidy; a missing name is a
      // five-hundred. Prettier and review cover the first.
      "no-unused-vars": "off",
      "no-empty": "off",
      "no-control-regex": "off",
      "no-useless-escape": "off",
    },
  },
];
