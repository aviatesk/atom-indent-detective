'use babel'

import { CompositeDisposable, TextEditor } from 'atom'
import status from './status'
import selector from './selector'

const possibleIndentations = [2, 3, 4, 6, 8]
let manual = new Set()
let subs

export function activate () {
  subs = new CompositeDisposable()

  status.activate()

  subs.add(atom.workspace.observeTextEditors((ed) => {
    run(ed)

    subs.add(ed.onDidStopChanging(() => {
      run(ed)
    }))
    subs.add(ed.onDidDestroy(() => {
      manual.delete(ed)
    }))
  }))
  subs.add(atom.workspace.onDidStopChangingActivePaneItem((item) => {
    if (item instanceof TextEditor) {
      run(item)
    }
  }))
  subs.add(atom.commands.add('atom-text-editor', {
    'indent-detective:choose-indent': () => select()
  }))
}

export function deactivate () {
  subs.dispose()
  manual.clear()
  status.deactivate()
}

export function consumeStatusBar (bar) {
  status.consumeStatusBar(bar)
}

function run (editor) {
  if (manual.has(editor) || editor.isDestroyed()) return

  setSettings(editor, getIndent(editor))

  status.updateText()
}

function setSettings (editor, indent) {
  if (indent == 'tab') {
    editor.setSoftTabs(false)
  } else if (indent => 2 && indent <= 8) {
    editor.setSoftTabs(true)
    editor.setTabLength(indent)
  }
}

function bestOf (counts) {
  let best = 0
  let score = 0
  for (let vote in counts) {
    if (counts[vote] > score) {
      best = vote
      score = counts[vote]
    }
  }
  return best
}

function getIndent (editor) {
  let row = 0
  let counts = {}
  let previousIndent = 0
  let previousDiff = 0
  for (let line of editor.getBuffer().getLines().slice(0,100)) {
    if (!isValidLine(row, line, editor)) continue
    let indent = lineIndent(line)

    if (indent == 'tab') return 'tab'
    let diff = Math.abs(indent - previousIndent)

    if (diff == 0) {
      if (previousDiff != 0) {
        counts[previousDiff] += 1
      }
    } else {
      if (!counts[diff]) counts[diff] = 0
      counts[diff] += 1
      previousDiff = diff
    }

    previousIndent = indent
    row += 1
  }

  return bestOf(counts)
}

function isValidLine (row, line, editor) {
  // empty line
  if (line.match(/^\s*$/)) return false

  // line is part of a comment or string
  for (let scope in editor.scopeDescriptorForBufferPosition(row).scopes) {
    if (scope.indexOf('comment') > -1 ||
        scope.indexOf('docstring') > -1 ||
        scope.indexOf('string') > -1) {
          return false
    }
  }

  return true
}

function lineIndent (line) {
  if (line.match(/^\t+/)) {
    return 'tab'
  } else {
    return line.match(/^([ ]*)/)[0].length
  }
}

function select () {
  let items = [{text: 'Automatic'}]
  for (let n of possibleIndentations) {
    items.push({text: `${n} Spaces`, length: n})
  }
  items.push({text: 'Tabs', length: 'tab'})
  let sel = selector.show(items, ({text, length}={}) =>{
    let editor = atom.workspace.getActiveTextEditor()
    if (text == 'Automatic') {
      manual.delete(editor)
      run(editor)
    } else {
      setSettings(editor, length)
      manual.add(editor)
      status.update()
    }
  })
}