import {
  BlockNoteEditor,
  BlockNoteEditorOptions,
  BlockSchema,
  DefaultBlockSchema,
} from "@blocknote/core";
import { DependencyList, useEffect, useState } from "react";
import { ReactBlockSideMenuFactory } from "../BlockSideMenu/BlockSideMenuFactory";
import { ReactFormattingToolbarFactory } from "../FormattingToolbar/FormattingToolbarFactory";
import { ReactHyperlinkToolbarFactory } from "../HyperlinkToolbar/HyperlinkToolbarFactory";
import { defaultReactSlashMenuItems } from "../SlashMenu/defaultReactSlashMenuItems";
import { ReactSlashMenuFactory } from "../SlashMenu/SlashMenuFactory";

//based on https://github.com/ueberdosis/tiptap/blob/main/packages/react/src/useEditor.ts

function useForceUpdate() {
  const [, setValue] = useState(0);

  return () => setValue((value) => value + 1);
}

/**
 * Main hook for importing a BlockNote editor into a React project
 */
export const useBlockNote = <BSchema extends BlockSchema = DefaultBlockSchema>(
  options: Partial<BlockNoteEditorOptions<BSchema>> = {},
  deps: DependencyList = []
) => {
  const [editor, setEditor] = useState<BlockNoteEditor<BSchema> | null>(null);
  const forceUpdate = useForceUpdate();

  useEffect(() => {
    let isMounted = true;
    // TODO: Fix typing. UiFactories expects only BaseSlashMenuItems, not extended types. Can be fixed with a generic,
    //  but it would have to be on several different classes (BlockNoteEditor, BlockNoteEditorOptions, UiFactories) and
    //  gets messy quick.
    let newOptions: Record<any, any> = {
      slashCommands: defaultReactSlashMenuItems<any>(),
      ...options,
    };
    if (!newOptions.uiFactories) {
      newOptions = {
        ...newOptions,
        uiFactories: {
          formattingToolbarFactory: ReactFormattingToolbarFactory,
          hyperlinkToolbarFactory: ReactHyperlinkToolbarFactory,
          slashMenuFactory: ReactSlashMenuFactory,
          blockSideMenuFactory: ReactBlockSideMenuFactory,
        },
      };
    }
    console.log("create new blocknote instance");
    const instance = new BlockNoteEditor<BSchema>(
      newOptions as Partial<BlockNoteEditorOptions<BSchema>>
    );

    setEditor(instance);

    instance._tiptapEditor.on("transaction", () => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (isMounted) {
            forceUpdate();
          }
        });
      });
    });

    return () => {
      instance._tiptapEditor.destroy();
      isMounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return editor;
};
