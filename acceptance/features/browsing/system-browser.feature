Feature: The System Browser

  Beyond the sidebar panes, Jasper has a full System Browser — a Smalltalk-style
  class browser in its own editor tab, with dictionaries, classes, categories, and
  method source side by side.

  @stone
  Scenario: Opening the System Browser
    Given I am logged in to the test stone
    When I open the System Browser
    Then the class browser opens
