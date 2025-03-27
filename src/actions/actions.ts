import * as vscode from 'vscode';
import { Action } from '../action_types';
import { HelixState } from '../helix_state_types';
import {
  enterInsertMode,
  enterNormalMode,
  enterSearchMode,
  enterCommandMode,
  enterSelectMode,
  enterVisualLineMode,
  enterVisualMode,
  setModeCursorStyle,
} from '../modes';
import { Mode } from '../modes_types';
import { parseKeysExact, parseKeysRegex } from '../parse_keys';
import * as positionUtils from '../position_utils';
import { putAfter } from '../put_utils/put_after';
import { getRegisterContentsList } from '../put_utils/common';
import { putBefore } from '../put_utils/put_before';
import { removeTypeSubscription } from '../type_subscription';
import { flashYankHighlight } from '../yank_highlight';
import { gotoActions } from './gotoMode';
import KeyMap from './keymaps';
import { matchActions } from './matchMode';
import { isSingleLineRange, yank } from './operators';
import { spaceActions } from './spaceMode';
import { unimparedActions } from './unimpared';
import { viewActions } from './viewMode';
import { windowActions } from './windowMode';

enum Direction {
  Up,
  Down,
}

export const actions: Action[] = [
  parseKeysExact(['p'], [Mode.Occurrence], () => {
    vscode.commands.executeCommand('editor.action.addSelectionToPreviousFindMatch');
  }),

  parseKeysExact(['a'], [Mode.Occurrence], () => {
    vscode.commands.executeCommand('editor.action.selectHighlights');
  }),

  parseKeysExact(['n'], [Mode.Normal], (helixState) => {
    if (helixState.searchState.selectModeActive) {
      vscode.commands.executeCommand('actions.findWithSelection');
      helixState.searchState.selectModeActive = false;
      return;
    }

    vscode.commands.executeCommand('editor.action.nextMatchFindAction');
  }),

  parseKeysExact(['N'], [Mode.Normal], (helixState) => {
    if (helixState.searchState.selectModeActive) {
      vscode.commands.executeCommand('actions.findWithSelection');
      helixState.searchState.selectModeActive = false;
      return;
    }
    vscode.commands.executeCommand('editor.action.previousMatchFindAction');
  }),

  parseKeysExact(['?'], [Mode.Normal], (helixState) => {
    enterSearchMode(helixState);
    helixState.searchState.previousSearchResult(helixState);
  }),

  // Selection Stuff
  parseKeysExact(['s'], [Mode.Normal, Mode.Visual], (helixState, editor) => {
    enterSelectMode(helixState);
    // if we enter select mode we should save the current selection
    helixState.currentSelection = editor.selection;
  }),

  parseKeysExact([','], [Mode.Normal, Mode.Visual], (_, editor) => {
    // Keep primary selection only
    editor.selections = editor.selections.slice(0, 1);
  }),

  parseKeysExact(['/'], [Mode.Normal], (helixState) => {
    enterSearchMode(helixState);
  }),

  parseKeysExact([':'], [Mode.Normal], (helixState) => {
    enterCommandMode(helixState);
  }),

  parseKeysExact(['*'], [Mode.Normal], (_) => {
    vscode.commands.executeCommand('actions.findWithSelection');
  }),

  parseKeysExact(['>'], [Mode.Normal, Mode.Visual], (_) => {
    vscode.commands.executeCommand('editor.action.indentLines');
  }),

  parseKeysExact(['<'], [Mode.Normal, Mode.Visual], (_) => {
    vscode.commands.executeCommand('editor.action.outdentLines');
  }),

  parseKeysExact(['='], [Mode.Normal, Mode.Visual], (_) => {
    vscode.commands.executeCommand('editor.action.formatSelection');
  }),

  parseKeysExact(['`'], [Mode.Normal], (vimState, editor) => {
    // Take the selection and make it all lowercase
    editor.edit((editBuilder) => {
      editor.selections.forEach((selection) => {
        const text = editor.document.getText(selection);
        editBuilder.replace(selection, text.toLowerCase());
      });
    });
  }),

  parseKeysExact(['~'], [Mode.Normal], (vimState, editor) => {
    // Switch the case of the selection (so if upper case make lower case and vice versa)
    editor.edit((editBuilder) => {
      editor.selections.forEach((selection) => {
        const text = editor.document.getText(selection);
        editBuilder.replace(
          selection,
          text.replace(/./g, (c) => (c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase())),
        );
      });
    });
  }),

  // 	replace
  parseKeysRegex(/^r(.)/, /^r/, [Mode.Normal], (helixState, editor, match) => {
    const position = editor.selection.active;
    editor.edit((builder) => {
      builder.replace(new vscode.Range(position, position.with({ character: position.character + 1 })), match[1]);
    });
  }),

  // existing
  parseKeysExact(
    [KeyMap.Actions.InsertMode],
    [Mode.Normal, Mode.Visual, Mode.VisualLine, Mode.Occurrence],
    (vimState, editor) => {
      enterInsertMode(vimState);
      setModeCursorStyle(vimState.mode, editor);
      removeTypeSubscription(vimState);
    },
  ),

  parseKeysExact([KeyMap.Actions.InsertAtLineStart], [Mode.Normal], (vimState, editor) => {
    editor.selections = editor.selections.map((selection) => {
      const character = editor.document.lineAt(selection.active.line).firstNonWhitespaceCharacterIndex;
      const newPosition = selection.active.with({ character: character });
      return new vscode.Selection(newPosition, newPosition);
    });

    enterInsertMode(vimState);
    setModeCursorStyle(vimState.mode, editor);
    removeTypeSubscription(vimState);
  }),

  parseKeysExact(['a'], [Mode.Normal], (vimState, editor) => {
    enterInsertMode(vimState, false);
    setModeCursorStyle(vimState.mode, editor);
    removeTypeSubscription(vimState);
  }),

  parseKeysExact([KeyMap.Actions.InsertAtLineEnd], [Mode.Normal], (vimState, editor) => {
    editor.selections = editor.selections.map((selection) => {
      const lineLength = editor.document.lineAt(selection.active.line).text.length;
      const newPosition = selection.active.with({ character: lineLength });
      return new vscode.Selection(newPosition, newPosition);
    });

    enterInsertMode(vimState);
    setModeCursorStyle(vimState.mode, editor);
    removeTypeSubscription(vimState);
  }),

  parseKeysExact(['v'], [Mode.Normal, Mode.VisualLine], (vimState, editor) => {
    enterVisualMode(vimState);
    setModeCursorStyle(vimState.mode, editor);
  }),

  parseKeysExact(['x'], [Mode.Normal, Mode.Visual], () => {
    vscode.commands.executeCommand('expandLineSelection');
  }),

  parseKeysExact([KeyMap.Actions.NewLineBelow], [Mode.Normal], (vimState, editor) => {
    enterInsertMode(vimState);
    vscode.commands.executeCommand('editor.action.insertLineAfter');
    setModeCursorStyle(vimState.mode, editor);
    removeTypeSubscription(vimState);
  }),

  parseKeysExact([KeyMap.Actions.NewLineAbove], [Mode.Normal], (vimState, editor) => {
    enterInsertMode(vimState);
    vscode.commands.executeCommand('editor.action.insertLineBefore');
    setModeCursorStyle(vimState.mode, editor);
    removeTypeSubscription(vimState);
  }),

  parseKeysExact(['p'], [Mode.Normal, Mode.Visual, Mode.VisualLine], putAfterOnNextLine),
  parseKeysExact(['P'], [Mode.Normal], putBefore),

  parseKeysExact(['u'], [Mode.Normal, Mode.Visual, Mode.VisualLine], () => {
    vscode.commands.executeCommand('undo');
  }),

  parseKeysExact(['U'], [Mode.Normal, Mode.Visual, Mode.VisualLine], () => {
    vscode.commands.executeCommand('redo');
  }),

  parseKeysExact(['d', 'd'], [Mode.Normal], (vimState, editor) => {
    deleteLine(vimState, editor);
  }),

  parseKeysExact(['D'], [Mode.Normal], () => {
    vscode.commands.executeCommand('deleteAllRight');
  }),

  parseKeysRegex(/(\\d+)g/, /^g$/, [Mode.Normal, Mode.Visual], (helixState, editor, match) => {
    new vscode.Position(parseInt(match[1]), 0);
  }),

  // add 1 character swap
  parseKeysRegex(/^x(.)$/, /^x$/, [Mode.Normal, Mode.Visual], (vimState, editor, match) => {
    editor.edit((builder) => {
      editor.selections.forEach((s) => {
        const oneChar = s.with({
          end: s.active.with({
            character: s.active.character + 1,
          }),
        });
        builder.replace(oneChar, match[1]);
      });
    });
  }),

  // same for rip command
  parseKeysRegex(
    RegExp(`^r(\\d+)(${KeyMap.Motions.MoveUp}|${KeyMap.Motions.MoveDown})$`),
    /^(r|r\d+)$/,
    [Mode.Normal, Mode.Visual],
    (vimState, editor, match) => {
      const lineCount = parseInt(match[1]);
      const direction = match[2] == KeyMap.Motions.MoveUp ? Direction.Up : Direction.Down;
      // console.log(`delete ${lineCount} lines up`);
      const selections = makeMultiLineSelection(vimState, editor, lineCount, direction);

      yank(vimState, editor, selections, true);

      deleteLines(vimState, editor, lineCount, direction);
    },
  ),

  // same for duplicate command
  parseKeysRegex(
    RegExp(`^q(\\d+)(${KeyMap.Motions.MoveUp}|${KeyMap.Motions.MoveDown})$`),
    /^(q|q\d+)$/,
    [Mode.Normal, Mode.Visual],
    (vimState, editor, match) => {
      const lineCount = parseInt(match[1]);
      const direction = match[2] == KeyMap.Motions.MoveUp ? Direction.Up : Direction.Down;
      // console.log(`delete ${lineCount} lines up`);
      editor.selections = makeMultiLineSelection(vimState, editor, lineCount, direction);
      vscode.commands.executeCommand('editor.action.copyLinesDownAction');
    },
  ),

  parseKeysExact(['c', 'c'], [Mode.Normal], (vimState, editor) => {
    editor.edit((editBuilder) => {
      editor.selections.forEach((selection) => {
        const line = editor.document.lineAt(selection.active.line);
        editBuilder.delete(
          new vscode.Range(
            selection.active.with({
              character: line.firstNonWhitespaceCharacterIndex,
            }),
            selection.active.with({ character: line.text.length }),
          ),
        );
      });
    });

    enterInsertMode(vimState);
    setModeCursorStyle(vimState.mode, editor);
    removeTypeSubscription(vimState);
  }),

  parseKeysExact(['C'], [Mode.Normal], (vimState, editor) => {
    vscode.commands.executeCommand('deleteAllRight');
    enterInsertMode(vimState);
    setModeCursorStyle(vimState.mode, editor);
    removeTypeSubscription(vimState);
  }),

  parseKeysExact(['y', 'y'], [Mode.Normal], (vimState, editor) => {
    yankLine(vimState, editor);

    // Yank highlight
    const highlightRanges = editor.selections.map((selection) => {
      const lineLength = editor.document.lineAt(selection.active.line).text.length;
      return new vscode.Range(
        selection.active.with({ character: 0 }),
        selection.active.with({ character: lineLength }),
      );
    });
    flashYankHighlight(editor, highlightRanges);
  }),

  parseKeysExact(['y'], [Mode.Normal, Mode.Visual], (vimState, editor) => {
    // Yank highlight
    const highlightRanges = editor.selections.map((selection) => selection.with());

    // We need to detect if the ranges are lines because we need to handle them differently
    highlightRanges.every((range) => isSingleLineRange(range));
    yank(vimState, editor, highlightRanges, false);
    flashYankHighlight(editor, highlightRanges);
    if (vimState.mode === Mode.Visual) {
      enterNormalMode(vimState);
    }
  }),

  parseKeysExact(['q', 'q'], [Mode.Normal, Mode.Visual], () => {
    vscode.commands.executeCommand('editor.action.copyLinesDownAction');
  }),

  parseKeysExact(['Q', 'Q'], [Mode.Normal, Mode.Visual], () => {
    vscode.commands.executeCommand('editor.action.copyLinesUpAction');
  }),

  parseKeysExact(['r', 'r'], [Mode.Normal], (vimState, editor) => {
    yankLine(vimState, editor);
    deleteLine(vimState, editor);
  }),

  parseKeysExact(['s', 's'], [Mode.Normal], (vimState, editor) => {
    editor.selections = editor.selections.map((selection) => {
      return new vscode.Selection(
        selection.active.with({ character: 0 }),
        positionUtils.lineEnd(editor.document, selection.active),
      );
    });

    enterVisualLineMode(vimState);
    setModeCursorStyle(vimState.mode, editor);
  }),

  parseKeysExact(['S'], [Mode.Normal], (vimState, editor) => {
    editor.selections = editor.selections.map((selection) => {
      return new vscode.Selection(selection.active, positionUtils.lineEnd(editor.document, selection.active));
    });

    enterVisualMode(vimState);
    setModeCursorStyle(vimState.mode, editor);
  }),

  // parseKeysExact(['h'], [Mode.Normal], (vimState, editor) => {
  //   vscode.commands.executeCommand('deleteLeft')
  // }),

  parseKeysExact([';'], [Mode.Normal], (vimState, editor) => {
    const active = editor.selection.active;
    editor.selection = new vscode.Selection(active, active);
  }),

  ...gotoActions,
  ...windowActions,
  ...viewActions,
  ...spaceActions,
  ...matchActions,
  ...unimparedActions,
];

function makeMultiLineSelection(
  vimState: HelixState,
  editor: vscode.TextEditor,
  lineCount: number,
  direction: Direction,
): vscode.Selection[] {
  return editor.selections.map((selection) => {
    if (direction == Direction.Up) {
      const endLine = selection.active.line - lineCount + 1;
      const startPos = positionUtils.lineEnd(editor.document, selection.active);
      const endPos = endLine >= 0 ? new vscode.Position(endLine, 0) : new vscode.Position(0, 0);
      return new vscode.Selection(startPos, endPos);
    } else {
      const endLine = selection.active.line + lineCount - 1;
      const startPos = new vscode.Position(selection.active.line, 0);
      const endPos =
        endLine < editor.document.lineCount
          ? new vscode.Position(endLine, editor.document.lineAt(endLine).text.length)
          : positionUtils.lastChar(editor.document);

      return new vscode.Selection(startPos, endPos);
    }
  });
}

function deleteLines(
  vimState: HelixState,
  editor: vscode.TextEditor,
  lineCount: number,
  direction: Direction = Direction.Down,
): void {
  const selections = editor.selections.map((selection) => {
    if (direction == Direction.Up) {
      const endLine = selection.active.line - lineCount;
      if (endLine >= 0) {
        const startPos = positionUtils.lineEnd(editor.document, selection.active);
        const endPos = new vscode.Position(endLine, editor.document.lineAt(endLine).text.length);
        return new vscode.Selection(startPos, endPos);
      } else {
        const startPos =
          selection.active.line + 1 <= editor.document.lineCount
            ? new vscode.Position(selection.active.line + 1, 0)
            : positionUtils.lineEnd(editor.document, selection.active);

        const endPos = new vscode.Position(0, 0);
        return new vscode.Selection(startPos, endPos);
      }
    } else {
      const endLine = selection.active.line + lineCount;
      if (endLine <= editor.document.lineCount - 1) {
        const startPos = new vscode.Position(selection.active.line, 0);
        const endPos = new vscode.Position(endLine, 0);
        return new vscode.Selection(startPos, endPos);
      } else {
        const startPos =
          selection.active.line - 1 >= 0
            ? new vscode.Position(
                selection.active.line - 1,
                editor.document.lineAt(selection.active.line - 1).text.length,
              )
            : new vscode.Position(selection.active.line, 0);

        const endPos = positionUtils.lastChar(editor.document);
        return new vscode.Selection(startPos, endPos);
      }
    }
  });

  editor
    .edit((builder) => {
      selections.forEach((sel) => builder.replace(sel, ''));
    })
    .then(() => {
      editor.selections = editor.selections.map((selection) => {
        const character = editor.document.lineAt(selection.active.line).firstNonWhitespaceCharacterIndex;
        const newPosition = selection.active.with({ character: character });
        return new vscode.Selection(newPosition, newPosition);
      });
    });
}

function deleteLine(vimState: HelixState, editor: vscode.TextEditor, direction: Direction = Direction.Down): void {
  deleteLines(vimState, editor, 1, direction);
}

function yankLine(vimState: HelixState, editor: vscode.TextEditor): void {
  vimState.registers = {
    contentsList: editor.selections.map((selection) => {
      return editor.document.lineAt(selection.active.line).text;
    }),
    linewise: true,
  };
}

export function switchToUppercase(editor: vscode.TextEditor): void {
  editor.edit((editBuilder) => {
    editor.selections.forEach((selection) => {
      const text = editor.document.getText(selection);
      editBuilder.replace(selection, text.toUpperCase());
    });
  });
}

export function incremenet(editor: vscode.TextEditor): void {
  // Move the cursor to the first number and incremene the number
  // If the cursor is not on a number, then do nothing
  editor.edit((editBuilder) => {
    editor.selections.forEach((selection) => {
      const translatedSelection = selection.with(selection.start, selection.start.translate(0, 1));
      const text = editor.document.getText(translatedSelection);
      const number = parseInt(text, 10);
      if (!isNaN(number)) {
        editBuilder.replace(translatedSelection, (number + 1).toString());
      }
    });
  });
}

export function decrement(editor: vscode.TextEditor): void {
  // Move the cursor to the first number and incremene the number
  // If the cursor is not on a number, then do nothing
  editor.edit((editBuilder) => {
    editor.selections.forEach((selection) => {
      const translatedSelection = selection.with(selection.start, selection.start.translate(0, 1));
      const text = editor.document.getText(translatedSelection);
      const number = parseInt(text, 10);
      if (!isNaN(number)) {
        editBuilder.replace(translatedSelection, (number - 1).toString());
      }
    });
  });
}

// 현재 커서가 있는 줄의 바로 아래 줄에 붙여넣는 함수
export function putAfterOnNextLine(vimState: HelixState, editor: vscode.TextEditor) {
  const registerContentsList = getRegisterContentsList(vimState, editor);
  if (registerContentsList === undefined) return;

  if (vimState.mode === Mode.Normal) {
    // 현재 커서가 있는 줄의 바로 아래 줄에 붙여넣기
    normalModePutOnNextLine(vimState, editor, registerContentsList);
  } else if (vimState.mode === Mode.Visual) {
    // Visual 모드에서는 선택된 영역을 대체하고 아래 줄에 붙여넣기
    visualModePutOnNextLine(vimState, editor, registerContentsList);
  } else {
    // Visual Line 모드에서는 선택된 줄을 대체하고 아래 줄에 붙여넣기
    visualLineModePutOnNextLine(vimState, editor, registerContentsList);
  }
}

function normalModePutOnNextLine(
  vimState: HelixState,
  editor: vscode.TextEditor,
  registerContentsList: (string | undefined)[]
) {
  // 줄바꿈 문자를 추가하지 않음 (linewise가 true인 경우에도)
  const insertContentsList = registerContentsList;

  // 현재 커서가 있는 줄의 다음 줄 시작 위치에 삽입
  const insertPositions = editor.selections.map((selection) => {
    const line = selection.active.line;
    const nextLine = line + 1;
    
    // 마지막 줄이면 새 줄을 추가
    if (nextLine >= editor.document.lineCount) {
      const lastLine = editor.document.lineCount - 1;
      const lastLineLength = editor.document.lineAt(lastLine).text.length;
      return new vscode.Position(lastLine, lastLineLength);
    }
    
    // 다음 줄의 시작 위치
    return new vscode.Position(nextLine, 0);
  });

  editor
    .edit((editBuilder) => {
      insertPositions.forEach((position, i) => {
        const contents = insertContentsList[i];
        if (contents === undefined) return;

        // 마지막 줄이면 줄바꿈을 추가
        if (position.line === editor.document.lineCount - 1 && 
            position.character === editor.document.lineAt(position.line).text.length) {
          editBuilder.insert(position, '\n' + contents);
        } else {
          // 새 줄에 삽입
          editBuilder.insert(position, contents + '\n');
        }
      });
    })
    .then(() => {
      // 삽입 후 커서 위치 조정
      editor.selections = editor.selections.map((selection, i) => {
        const line = selection.active.line + 1;
        const position = new vscode.Position(line, 0);
        return new vscode.Selection(position, position);
      });
    });

  // 마지막 삽입 정보 저장
  vimState.lastPutRanges = {
    ranges: insertPositions.map((position, i) => {
      const contents = insertContentsList[i];
      if (contents === undefined) return undefined;
      const endPos = new vscode.Position(position.line, contents.length);
      return new vscode.Range(position, endPos);
    }),
    linewise: true,
  };
}

function visualModePutOnNextLine(
  vimState: HelixState,
  editor: vscode.TextEditor,
  registerContentsList: (string | undefined)[]
) {
  // 선택된 영역 삭제 후 다음 줄에 삽입
  editor
    .edit((editBuilder) => {
      editor.selections.forEach((selection, i) => {
        const contents = registerContentsList[i];
        if (contents === undefined) return;

        // 선택된 영역 삭제
        editBuilder.delete(selection);
        
        // 다음 줄 시작 위치 계산
        const line = selection.active.line;
        const nextLine = line + 1;
        
        // 마지막 줄이면 새 줄을 추가
        if (nextLine >= editor.document.lineCount) {
          const lastLine = editor.document.lineCount - 1;
          const lastLineLength = editor.document.lineAt(lastLine).text.length;
          const position = new vscode.Position(lastLine, lastLineLength);
          editBuilder.insert(position, '\n' + contents);
        } else {
          // 다음 줄의 시작 위치
          const position = new vscode.Position(nextLine, 0);
          editBuilder.insert(position, contents + '\n');
        }
      });
    })
    .then(() => {
      // 삽입 후 커서 위치 조정
      editor.selections = editor.selections.map((selection) => {
        const line = selection.active.line + 1;
        const position = new vscode.Position(line, 0);
        return new vscode.Selection(position, position);
      });

      enterNormalMode(vimState);
      setModeCursorStyle(vimState.mode, editor);
    });
}

function visualLineModePutOnNextLine(
  vimState: HelixState,
  editor: vscode.TextEditor,
  registerContentsList: (string | undefined)[]
) {
  // Visual Line 모드에서는 선택된 줄을 삭제하고 다음 줄에 삽입
  editor
    .edit((editBuilder) => {
      editor.selections.forEach((selection, i) => {
        const contents = registerContentsList[i];
        if (contents === undefined) return;

        // 선택된 영역 삭제
        editBuilder.delete(selection);
        
        // 삭제 후 현재 줄 아래에 삽입
        const position = selection.start;
        editBuilder.insert(position, contents + '\n');
      });
    })
    .then(() => {
      // 삽입 후 커서 위치 조정
      editor.selections = editor.selections.map((selection) => {
        const position = selection.start;
        return new vscode.Selection(position, position);
      });

      enterNormalMode(vimState);
      setModeCursorStyle(vimState.mode, editor);
    });
}
