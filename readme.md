# LobbyCloud ⛅

Who let the docs out?

## What is this?

The sourcecode behind [LobbyCloud](http://lobbycloud.eu/).

## What does it do?

Stuff that yet has to be documented.

## What you need

* [nodejs](http://nodejs.org/)
* [Elastic Search](http://elasticsearch.org/)
* [MongoDB](https://www.mongodb.org/)
* [pdf3json](https://github.com/yetzt/pdf3json)
* [pdfinfo](http://www.foolabs.com/xpdf/download.html)

## Bugs and Trouble

* We can't use [express](https://github.com/visionmedia/express) 4.x yet, because [mustache-express](https://github.com/bryanburgers/node-mustache-express/) wants ~3 as peer dependency
* [mongojs](https://github.com/mafintosh/mongojs/) 0.12 is [broken](https://github.com/mafintosh/mongojs/issues/135) so we use 0.11 till it's fixed.
* pdfinfo needs to support `-rawdates`; when in doubt, use the [statically linked binary](http://www.foolabs.com/xpdf/download.html).
* pdftxt needs [pdf3json](https://github.com/yetzt/pdf3json/) which is a fork of the infamous [pdf2json](https://code.google.com/p/pdf2json/)
