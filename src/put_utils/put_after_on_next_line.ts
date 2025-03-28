import * as vscode from 'vscode';

import { HelixState } from '../helix_state_types';
import { Mode } from '../modes_types';
import { enterNormalMode, setModeCursorStyle } from '../modes';
import { getRegisterContentsList } from './common';

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
  registerContentsList: (string | undefined)[],
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
        if (
          position.line === editor.document.lineCount - 1 &&
          position.character === editor.document.lineAt(position.line).text.length
        ) {
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
  registerContentsList: (string | undefined)[],
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
  registerContentsList: (string | undefined)[],
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
