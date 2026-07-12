Feature: Installing the enhanced inspector

  Out of the box, "Inspect It" opens a plain list of an object's instance
  variables. Jasper can install a Smalltalk-style *enhanced inspector* into the
  stone — rich, object-specific views you can drill through. Because it files
  classes into the database, installing needs a SystemUser login, so Jasper asks
  before doing it (and remembers your answer).

  @stone @stone:bare @enhanced-ask
  Scenario: Jasper offers to install the enhanced inspector on connect
    Given I am logged in to the test stone
    Then Jasper offers to install the enhanced inspector

  @stone @stone:bare @enhanced-ask @systemuser
  Scenario: Installing it makes Inspect It open the enhanced inspector
    Given I am logged in to the test stone
    And Jasper offers to install the enhanced inspector
    When I choose Install
    And I inspect the expression "3 + 4"
    Then the enhanced inspector opens

  @stone @stone:bare @enhanced-ask
  Scenario: Declining keeps the classic inspector
    Given I am logged in to the test stone
    And Jasper offers to install the enhanced inspector
    When I dismiss the offer
    And I inspect the expression "3 + 4"
    Then the classic inspector opens

  @stone @stone:bare @enhanced-always @systemuser
  Scenario: With auto-install on, it installs without asking
    Given I am logged in to the test stone
    Then the enhanced inspector installs without prompting

  @stone @stone:bare @systemuser
  Scenario: Installing on demand from the Command Palette
    Given I am logged in to the test stone
    When I install the enhanced inspector from the Command Palette
    And I inspect the expression "3 + 4"
    Then the enhanced inspector opens
