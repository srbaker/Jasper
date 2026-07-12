Feature: Installing Jasper

  Jasper is published on the Visual Studio Marketplace as "Jasper: A GemStone
  Smalltalk IDE". You install it the way you install any VS Code extension — from
  the Extensions view — and a GemStone activity appears in the sidebar, ready to
  use. This is the very first thing a new user does, so it opens the manual.

  # TODO — tricky, not run by default (@tricky). Driving the real Marketplace
  # Install button is fragile in the test build:
  #   1. the UI install hangs on signature verification (the CLI path doesn't
  #      enforce it) — worked around with `extensions.verifySignature: false`;
  #   2. Jasper is a `workspace` extension, so activation needs a window *reload*,
  #      which destroys the Playwright page and must be re-acquired from the
  #      Electron app.
  # Flesh out later; run on demand with `npm run test:tricky`.
  @install @tricky
  Scenario: Installing Jasper from the Marketplace
    Given a bare VS Code with no extensions installed
    When I search the Marketplace for "GemStone Smalltalk"
    And I install the Jasper extension
    Then the GemStone activity appears in the sidebar
