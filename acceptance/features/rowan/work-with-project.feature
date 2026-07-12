Feature: Working with a Rowan project

  Jasper reads the Rowan project in your open folder straight from disk — no stone
  required — and shows its packages, classes, and methods. You author code as
  files and load it into an image later; the project on disk is the starting
  point.

  @rowan-project
  Scenario: Jasper recognizes the project and shows its structure
    Given I have opened the HelloRowan project
    Then the Rowan view lists the "HelloRowan-Core" package
    And the "HelloRowan-Core" package contains the "Greeter" class
    And the "Greeter" class has a "greet:" method

  @rowan-project
  Scenario: Opening a method for focused, disk-first editing
    Given I have opened the HelloRowan project
    When I open the "greet:" method from the Rowan view
    Then its source opens on its own, ready to edit
