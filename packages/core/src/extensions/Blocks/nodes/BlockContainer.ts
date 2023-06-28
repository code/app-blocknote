import { Fragment, Node, Slice } from "@tiptap/pm/model";
import { liftListItem, sinkListItem } from "@tiptap/pm/schema-list";
import { TextSelection } from "@tiptap/pm/state";
import {
  ApplySchemaAttributes,
  CommandFunction,
  KeyBindingProps,
  NodeExtension,
  NodeExtensionSpec,
  chainKeyBindingCommands,
  convertCommand,
} from "remirror";
import {
  blockToNode,
  inlineContentToNodes,
} from "../../../api/nodeConversions/nodeConversions";
import { BlockSchema, PartialBlock } from "../api/blockTypes";
import { getBlockInfoFromPos } from "../helpers/getBlockInfoFromPos";
import styles from "./Block.module.css";
import BlockAttributes from "./BlockAttributes";

// TODO
export interface IBlock {
  HTMLAttributes: Record<string, any>;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    block: {
      BNCreateBlock: (pos: number) => ReturnType;
      BNDeleteBlock: (posInBlock: number) => ReturnType;
      BNMergeBlocks: (posBetweenBlocks: number) => ReturnType;
      BNSplitBlock: (posInBlock: number, keepType: boolean) => ReturnType;
      BNUpdateBlock: <BSchema extends BlockSchema>(
        posInBlock: number,
        block: PartialBlock<BSchema>
      ) => ReturnType;
      BNCreateOrUpdateBlock: <BSchema extends BlockSchema>(
        posInBlock: number,
        block: PartialBlock<BSchema>
      ) => ReturnType;
    };
  }
}

/**
 * The main "Block node" documents consist of
 */
export class BlockContainerExtension extends NodeExtension {
  get name() {
    return "blockContainer" as const;
  }
  createNodeSpec(extra: ApplySchemaAttributes): NodeExtensionSpec {
    return {
      group: "block",
      content: "blockContent blockGroup?",
      defining: true,
      attrs: {
        ...extra.defaults(),
      },
      parseDOM: [
        {
          tag: "div",
          getAttrs: (node) => {
            if (node instanceof HTMLElement) {
              const attrs: Record<string, string> = {};
              for (let [nodeAttr, HTMLAttr] of Object.entries(
                BlockAttributes
              )) {
                if (node.getAttribute(HTMLAttr)) {
                  attrs[nodeAttr] = node.getAttribute(HTMLAttr)!;
                }
              }
              return attrs;
            }
            return {};
          },
        },
      ],
      toDOM: (node) => {
        const { HTMLAttributes } = node.attrs;
        return [
          "div",
          {
            ...HTMLAttributes,
            class: styles.blockOuter,
            ...extra.dom(node),
            "data-node-type": "block-outer",
          },
          [
            "div",
            {
              // TODO: maybe remove html attributes from inner block
              class: styles.block,
              ...extra.dom(node),
              "data-node-type": this.name,
            },
            0,
          ],
        ];
      },
    };
  }

  // return {
  //   *       haveFun() {
  //   *         return ({ state, dispatch }) => {
  //   *           if (dispatch) {
  //   *             dispatch(tr.insertText('Have fun!'));
  //   *           }
  //   *
  //   *           return true; // True return signifies that this command is enabled.
  //   *         }
  //   *       },
  //   *     }
  //   *
  createCommands() {
    return {
      // Creates a new text block at a given position.
      BNCreateBlock(pos: number): CommandFunction {
        return convertCommand((state, dispatch) => {
          const newBlock =
            state.schema.nodes["blockContainer"].createAndFill()!;

          if (dispatch) {
            state.tr.insert(pos, newBlock);
            dispatch(state.tr);
          }

          return true;
        });
      },

      // Deletes a block at a given position.
      BNDeleteBlock(posInBlock: number): CommandFunction {
        return convertCommand((state, dispatch) => {
          const blockInfo = getBlockInfoFromPos(state.doc, posInBlock);
          if (blockInfo === undefined) {
            return false;
          }

          const { startPos, endPos } = blockInfo;

          if (dispatch) {
            state.tr.deleteRange(startPos, endPos);
            dispatch(state.tr);
          }

          return true;
        });
      },
      // Updates a block at a given position.
      BNUpdateBlock(posInBlock: number, block: any): CommandFunction {
        return convertCommand((state, dispatch) => {
          const blockInfo = getBlockInfoFromPos(state.doc, posInBlock);
          if (blockInfo === undefined) {
            return false;
          }

          const { startPos, endPos, node, contentNode } = blockInfo;

          if (dispatch) {
            // Adds blockGroup node with child blocks if necessary.
            if (block.children !== undefined) {
              const childNodes = [];

              // Creates ProseMirror nodes for each child block, including their descendants.
              for (const child of block.children) {
                childNodes.push(blockToNode(child, state.schema));
              }

              // Checks if a blockGroup node already exists.
              if (node.childCount === 2) {
                // Replaces all child nodes in the existing blockGroup with the ones created earlier.
                state.tr.replace(
                  startPos + contentNode.nodeSize + 1,
                  endPos - 1,
                  new Slice(Fragment.from(childNodes), 0, 0)
                );
              } else {
                // Inserts a new blockGroup containing the child nodes created earlier.
                state.tr.insert(
                  startPos + contentNode.nodeSize,
                  state.schema.nodes["blockGroup"].create({}, childNodes)
                );
              }
            }

            // Replaces the blockContent node's content if necessary.
            if (block.content !== undefined) {
              let content: Node[] = [];

              // Checks if the provided content is a string or InlineContent[] type.
              if (typeof block.content === "string") {
                // Adds a single text node with no marks to the content.
                content.push(state.schema.text(block.content));
              } else {
                // Adds a text node with the provided styles converted into marks to the content, for each InlineContent
                // object.
                content = inlineContentToNodes(block.content, state.schema);
              }

              // Replaces the contents of the blockContent node with the previously created text node(s).
              state.tr.replace(
                startPos + 1,
                startPos + contentNode.nodeSize - 1,
                new Slice(Fragment.from(content), 0, 0)
              );
            }

            // Changes the blockContent node type and adds the provided props as attributes. Also preserves all existing
            // attributes that are compatible with the new type.
            state.tr.setNodeMarkup(
              startPos,
              block.type === undefined
                ? undefined
                : state.schema.nodes[block.type],
              {
                ...contentNode.attrs,
                ...block.props,
              }
            );

            // Adds all provided props as attributes to the parent blockContainer node too, and also preserves existing
            // attributes.
            state.tr.setNodeMarkup(startPos - 1, undefined, {
              ...node.attrs,
              ...block.props,
            });
            dispatch(state.tr);
          }

          return true;
        });
      },
      // Appends the text contents of a block to the nearest previous block, given a position between them. Children of
      // the merged block are moved out of it first, rather than also being merged.
      //
      // In the example below, the position passed into the function is between Block1 and Block2.
      //
      // Block1
      //    Block2
      // Block3
      //    Block4
      //        Block5
      //
      // Becomes:
      //
      // Block1
      //    Block2Block3
      // Block4
      //     Block5
      BNMergeBlocks(posBetweenBlocks: number): CommandFunction {
        return convertCommand((state, dispatch) => {
          const nextNodeIsBlock =
            state.tr.doc.resolve(posBetweenBlocks + 1).node().type.name ===
            "blockContainer";
          const prevNodeIsBlock =
            state.doc.resolve(posBetweenBlocks - 1).node().type.name ===
            "blockContainer";

          if (!nextNodeIsBlock || !prevNodeIsBlock) {
            return false;
          }

          const nextBlockInfo = getBlockInfoFromPos(
            state.doc,
            posBetweenBlocks + 1
          );

          const { node, contentNode, startPos, endPos, depth } = nextBlockInfo!;

          // Removes a level of nesting all children of the next block by 1 level, if it contains both content and block
          // group nodes.
          if (node.childCount === 2) {
            const childBlocksStart = state.doc.resolve(
              startPos + contentNode.nodeSize + 1
            );
            const childBlocksEnd = state.doc.resolve(endPos - 1);
            const childBlocksRange =
              childBlocksStart.blockRange(childBlocksEnd);

            // Moves the block group node inside the block into the block group node that the current block is in.
            if (dispatch) {
              state.tr.lift(childBlocksRange!, depth - 1);
            }
          }

          let prevBlockEndPos = posBetweenBlocks - 1;
          let prevBlockInfo = getBlockInfoFromPos(state.doc, prevBlockEndPos);

          // Finds the nearest previous block, regardless of nesting level.
          while (prevBlockInfo!.numChildBlocks > 0) {
            prevBlockEndPos--;
            prevBlockInfo = getBlockInfoFromPos(state.doc, prevBlockEndPos);
            if (prevBlockInfo === undefined) {
              if (dispatch) {
                dispatch(state.tr); // dispatch previous tr change
              }
              return false;
            }
          }

          // Deletes next block and adds its text content to the nearest previous block.
          // TODO: Use slices.
          if (dispatch) {
            state.tr.deleteRange(startPos, startPos + contentNode.nodeSize);
            state.tr.insertText(contentNode.textContent, prevBlockEndPos - 1);
            state.tr.setSelection(
              new TextSelection(state.doc.resolve(prevBlockEndPos - 1))
            );
            dispatch(state.tr);
          }

          return true;
        });
      },
      // Splits a block at a given position. Content after the position is moved to a new block below, at the same
      // nesting level.
      BNSplitBlock(posInBlock: number, keepType: boolean): CommandFunction {
        return convertCommand((state, dispatch, view) => {
          const blockInfo = getBlockInfoFromPos(state.doc, posInBlock);
          if (blockInfo === undefined) {
            return false;
          }

          const { contentNode, contentType, startPos, endPos, depth } =
            blockInfo;

          const originalBlockContent = state.doc.cut(startPos + 1, posInBlock);
          const newBlockContent = state.doc.cut(posInBlock, endPos - 1);

          const newBlock =
            state.schema.nodes["blockContainer"].createAndFill()!;

          const newBlockInsertionPos = endPos + 1;
          const newBlockContentPos = newBlockInsertionPos + 2;

          if (dispatch) {
            // Creates a new block. Since the schema requires it to have a content node, a paragraph node is created
            // automatically, spanning newBlockContentPos to newBlockContentPos + 1.
            state.tr.insert(newBlockInsertionPos, newBlock);

            // Replaces the content of the newly created block's content node. Doesn't replace the whole content node so
            // its type doesn't change.
            state.tr.replace(
              newBlockContentPos,
              newBlockContentPos + 1,
              newBlockContent.content.size > 0
                ? new Slice(
                    Fragment.from(newBlockContent),
                    depth + 2,
                    depth + 2
                  )
                : undefined
            );

            // Changes the type of the content node. The range doesn't matter as long as both from and to positions are
            // within the content node.
            if (keepType) {
              state.tr.setBlockType(
                newBlockContentPos,
                newBlockContentPos,
                state.schema.node(contentType).type,
                contentNode.attrs
              );
            }

            // Sets the selection to the start of the new block's content node.
            state.tr.setSelection(
              new TextSelection(state.doc.resolve(newBlockContentPos))
            );

            // Replaces the content of the original block's content node. Doesn't replace the whole content node so its
            // type doesn't change.
            state.tr.replace(
              startPos + 1,
              endPos - 1,
              originalBlockContent.content.size > 0
                ? new Slice(
                    Fragment.from(originalBlockContent),
                    depth + 2,
                    depth + 2
                  )
                : undefined
            );
            dispatch(state.tr);
          }

          return true;
        });
      },
    };
  }

  // addProseMirrorPlugins() {
  //   return [PreviousBlockTypePlugin()];
  // }

  createKeymap() {
    // handleBackspace is partially adapted from https://github.com/ueberdosis/tiptap/blob/ed56337470efb4fd277128ab7ef792b37cfae992/packages/core/src/extensions/keymap.ts
    const handleBackspace = chainKeyBindingCommands(
      // Deletes the selection if it's not empty.
      // this.store.commands.delete,
      // Undoes an input rule if one was triggered in the last editor state change.
      // () => commands.undoInputRule(),
      // Reverts block content type to a paragraph if the selection is at the start of the block.
      ({ state }: KeyBindingProps) => {
        const { contentType } = getBlockInfoFromPos(
          state.doc,
          state.selection.from
        )!;

        const selectionAtBlockStart =
          state.selection.$anchor.parentOffset === 0;
        const isParagraph = contentType.name === "paragraph";

        if (selectionAtBlockStart && !isParagraph) {
          return this.store.commands.BNUpdateBlock(state.selection.from, {
            type: "paragraph",
            props: {},
          }) as any;
        }

        return false;
      },
      // Removes a level of nesting if the block is indented if the selection is at the start of the block.
      ({ state, dispatch, view }: KeyBindingProps) => {
        const selectionAtBlockStart =
          state.selection.$anchor.parentOffset === 0;

        if (selectionAtBlockStart) {
          return liftListItem(this.type)(state, dispatch, view); // TODO: convertcommand?
          // return this.store.commands.liftListItem("blockContainer");
        }

        return false;
      },
      // Merges block with the previous one if it isn't indented, isn't the first block in the doc, and the selection
      // is at the start of the block.
      (props: KeyBindingProps) => {
        const { state } = props;
        const { depth, startPos } = getBlockInfoFromPos(
          state.doc,
          state.selection.from
        )!;

        const selectionAtBlockStart =
          state.selection.$anchor.parentOffset === 0;
        const selectionEmpty = state.selection.anchor === state.selection.head;
        const blockAtDocStart = startPos === 2;

        const posBetweenBlocks = startPos - 1;

        if (
          !blockAtDocStart &&
          selectionAtBlockStart &&
          selectionEmpty &&
          depth === 2
        ) {
          return this.store.commands.BNMergeBlocks.original(posBetweenBlocks)(
            props
          );
          // const chain = this.store.chain.BNMergeBlocks(posBetweenBlocks);
          // chain.run();
          // return true; // this doesn't seem right, we should return the return value of BNMergeBlocks? How to properly call the command?
        }

        return false;
      }
    );

    const handleEnter = chainKeyBindingCommands(
      // Removes a level of nesting if the block is empty & indented, while the selection is also empty & at the start
      // of the block.
      ({ state, dispatch, view }: KeyBindingProps) => {
        const { node, depth } = getBlockInfoFromPos(
          state.doc,
          state.selection.from
        )!;

        const selectionAtBlockStart =
          state.selection.$anchor.parentOffset === 0;
        const selectionEmpty = state.selection.anchor === state.selection.head;
        const blockEmpty = node.textContent.length === 0;
        const blockIndented = depth > 2;

        if (
          selectionAtBlockStart &&
          selectionEmpty &&
          blockEmpty &&
          blockIndented
        ) {
          return liftListItem(this.type)(state, dispatch, view);
        }

        return false;
      },
      // Creates a new block and moves the selection to it if the current one is empty, while the selection is also
      // empty & at the start of the block.
      ({ state }: KeyBindingProps) => {
        const { node, endPos } = getBlockInfoFromPos(
          state.doc,
          state.selection.from
        )!;

        const selectionAtBlockStart =
          state.selection.$anchor.parentOffset === 0;
        const selectionEmpty = state.selection.anchor === state.selection.head;
        const blockEmpty = node.textContent.length === 0;

        if (selectionAtBlockStart && selectionEmpty && blockEmpty) {
          const newBlockInsertionPos = endPos + 1;
          const newBlockContentPos = newBlockInsertionPos + 2;
          // this.store.commands.selectText()
          const chain = this.store.chain.BNCreateBlock(newBlockInsertionPos);

          chain.selectText(newBlockContentPos);

          chain.run();
          return true;
        }

        return false;
      },
      // Splits the current block, moving content inside that's after the cursor to a new text block below. Also
      // deletes the selection beforehand, if it's not empty.
      ({ state }: KeyBindingProps) => {
        const { node } = getBlockInfoFromPos(state.doc, state.selection.from)!;

        const blockEmpty = node.textContent.length === 0;

        if (!blockEmpty) {
          const chain = this.store.chain.delete();
          chain.BNSplitBlock(state.selection.from, false);
          // chain()
          //   .deleteSelection() TODO
          //   .BNSplitBlock(state.selection.from, false)
          //   .run();
          chain.run();
          return true;
        }

        return false;
      }
    );

    return {
      Backspace: handleBackspace,
      Enter: handleEnter,
      // Always returning true for tab key presses ensures they're not captured by the browser. Otherwise, they blur the
      // editor since the browser will try to use tab for keyboard navigation.
      Tab: ({ state, dispatch, view }: KeyBindingProps) => {
        return sinkListItem(this.type)(state, dispatch, view); // TODO: convertcommand?
        // this.store.commands.sinkListItem("blockContainer");
        // return true;
      },
      "Shift-Tab": ({ state, dispatch, view }: KeyBindingProps) => {
        return liftListItem(this.type)(state, dispatch, view); // TODO: convertcommand?
      },
      "Mod-Alt-0": ({ state }: KeyBindingProps) =>
        this.store.commands.BNCreateBlock(state.selection.anchor + 2),
      "Mod-Alt-1": ({ state }: KeyBindingProps) =>
        this.store.commands.BNUpdateBlock(state.selection.anchor, {
          type: "heading",
          props: {
            level: "1",
          },
        }),
      "Mod-Alt-2": ({ state }: KeyBindingProps) =>
        this.store.commands.BNUpdateBlock(state.selection.anchor, {
          type: "heading",
          props: {
            level: "2",
          },
        }),
      "Mod-Alt-3": ({ state }: KeyBindingProps) =>
        this.store.commands.BNUpdateBlock(state.selection.anchor, {
          type: "heading",
          props: {
            level: "3",
          },
        }),
      "Mod-Shift-7": ({ state }: KeyBindingProps) =>
        this.store.commands.BNUpdateBlock(state.selection.anchor, {
          type: "bulletListItem",
          props: {},
        }),
      "Mod-Shift-8": ({ state }: KeyBindingProps) =>
        this.store.commands.BNUpdateBlock(state.selection.anchor, {
          type: "numberedListItem",
          props: {},
        }),
    };
  }
}
