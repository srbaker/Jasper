<!--
  The manual's table of contents.

  This is the ONE place to shape the manual's structure. Each `##` heading is a
  section; each `-` list item under it is a chapter, named by its **Feature name**
  (the `Feature:` line in the .feature file). The generator turns this into the
  sidebar:

    - chapters render in the order listed here, grouped under their section;
    - a chapter listed here but not yet generated (its test hasn't run) is
      silently skipped — so you can plan the TOC ahead of the coverage;
    - a generated chapter NOT listed here still appears, under a trailing "More"
      section, so nothing is ever lost by forgetting to add it.

  Everything else here (this comment, the title, any prose) is ignored by the
  parser — only `##` headings and `-` list items matter.
-->

# Table of Contents

## Quickstart

- From a fresh install to a running web application

## Getting started

- The GemStone sidebar
- Trusting your workspace
- Downloading a GemStone release
- Installing Jasper

## Databases & environment

- The GemStone Manager

## Connecting to a stone

- A folder must be open to log in
- The Login Launcher
- Connecting to a stone

## Writing Smalltalk

- Executing Smalltalk

## Browsing the image

- The Stage Browser

## Rowan projects

- Creating a Rowan project
- Working with a Rowan project
- A project's Rowan settings
- Committing changes to disk

## Reference

- Glossary
