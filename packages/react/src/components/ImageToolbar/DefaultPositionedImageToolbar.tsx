import {
  BlockNoteEditor,
  BlockSchema,
  DefaultBlockSchema,
} from "@blocknote/core";
import { FC } from "react";
import { flip, offset } from "@floating-ui/react";

import { useUiElement } from "../../hooks/useUiElement";
import { useUiElementPosition } from "../../hooks/useUiElementPosition";
import { DefaultImageToolbar, ImageToolbarProps } from "./DefaultImageToolbar";

export const DefaultPositionedImageToolbar = <
  BSchema extends BlockSchema = DefaultBlockSchema
>(props: {
  editor: BlockNoteEditor<BSchema, any, any>;
  imageToolbar?: FC<ImageToolbarProps<BSchema>>;
}) => {
  const state = useUiElement(
    props.editor.imageToolbar.onUpdate.bind(props.editor.imageToolbar)
  );
  const { isMounted, ref, style } = useUiElementPosition(
    state?.show || false,
    state?.referencePos || null,
    5000,
    {
      placement: "bottom",
      middleware: [offset(10), flip()],
    }
  );

  if (!isMounted || !state) {
    return null;
  }

  const { show, referencePos, ...data } = state;

  const ImageToolbar = props.imageToolbar || DefaultImageToolbar;

  return (
    <div ref={ref} style={style}>
      <ImageToolbar editor={props.editor} {...data} />
    </div>
  );
};