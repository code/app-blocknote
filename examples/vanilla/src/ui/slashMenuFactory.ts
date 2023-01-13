import { SlashMenuItem, SuggestionsMenuFactory } from "@blocknote/core";
import { createButton } from "./util";

/**
 * This menu is drawn when the cursor is moved to a hyperlink (using the keyboard),
 * or when the mouse is hovering over a hyperlink
 */
export const slashMenuFactory: SuggestionsMenuFactory<SlashMenuItem> = (
  _props
) => {
  const container = document.createElement("div");
  container.style.background = "gray";
  container.style.position = "absolute";
  container.style.padding = "10px";
  container.style.opacity = "0.8";
  container.style.display = "none";
  document.body.appendChild(container);

  function updateItems(
    items: SlashMenuItem[],
    onClick: (item: SlashMenuItem) => void,
    selected: number
  ) {
    container.innerHTML = "";
    const domItems = items.map((val, i) => {
      const element = createButton(val.name, () => {
        onClick(val);
      });
      element.style.display = "block";
      if (selected === i) {
        element.style.fontWeight = "bold";
      }
      return element;
    });
    container.append(...domItems);
    return domItems;
  }

  return {
    element: container,
    show: (params) => {
      updateItems(params.items, params.itemCallback, params.selectedItemIndex);
      container.style.display = "block";
      console.log("show", params);

      container.style.top = params.queryStartBoundingBox.y + "px";
      container.style.left = params.queryStartBoundingBox.x + "px";
    },
    hide: () => {
      container.style.display = "none";
    },
    update: (params) => {
      console.log("update", params);
      updateItems(params.items, params.itemCallback, params.selectedItemIndex);
      container.style.top = params.queryStartBoundingBox.y + "px";
      container.style.left = params.queryStartBoundingBox.x + "px";
    },
  };
};