Feature: Opening a method's source

  Browsing down to a method and picking it opens its source in an ordinary editor,
  backed by the running image (a gemstone:// document). Kernel methods open
  read-only — you read them here and edit your own code the same way.

  @stone
  Scenario: Opening a method's source from the browser
    Given I am logged in to the test stone
    When I open a method from the browser
    Then its source opens in an editor
