Feature: Downloading a GemStone release

  Before you can run a stone you need a GemStone/S distribution. Jasper's Versions
  view lists every release available from GemTalk and downloads the one you pick,
  so you never leave the editor to go hunting on a website.

  # @download is slow (a real ~220 MB release download) and excluded from the
  # default run; it caches the release under acceptance/.download-cache so later
  # runs reuse it. Run on demand with `npm run test:download`.
  @download @timeout:900000
  Scenario: Downloading a GemStone release
    Given the available GemStone releases are listed
    When I download GemStone "3.7.5"
    Then GemStone "3.7.5" is downloaded
