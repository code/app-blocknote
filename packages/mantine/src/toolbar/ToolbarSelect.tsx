import * as Mantine from "@mantine/core";

import { isSafari } from "@blocknote/core";
import { ComponentProps } from "@blocknote/react";
import { HiChevronDown } from "react-icons/hi";
import { TiTick } from "react-icons/ti";

// TODO: turn into select
export function ToolbarSelect(
  props: ComponentProps["FormattingToolbar"]["Select"]
) {
  const { className, items, isDisabled } = props;

  const selectedItem = items.filter((p) => p.isSelected)[0];

  if (!selectedItem) {
    return null;
  }

  return (
    <Mantine.Menu
      withinPortal={false}
      transitionProps={{
        exitDuration: 0,
      }}
      disabled={isDisabled}
      middlewares={{ flip: true, shift: true, inline: false, size: true }}>
      <Mantine.Menu.Target>
        <Mantine.Button
          // Needed as Safari doesn't focus button elements on mouse down
          // unlike other browsers.
          onMouseDown={(e) => {
            if (isSafari()) {
              (e.currentTarget as HTMLButtonElement).focus();
            }
          }}
          leftSection={selectedItem.icon}
          rightSection={<HiChevronDown />}
          size={"xs"}
          variant={"subtle"}
          disabled={isDisabled}>
          {selectedItem.text}
        </Mantine.Button>
      </Mantine.Menu.Target>
      <Mantine.Menu.Dropdown className={className}>
        {items.map((item) => (
          <Mantine.Menu.Item
            key={item.text}
            onClick={item.onClick}
            leftSection={item.icon}
            rightSection={
              item.isSelected ? (
                <TiTick size={20} className={"bn-tick-icon"} />
              ) : (
                // Ensures space for tick even if item isn't currently selected.
                <div className={"bn-tick-space"} />
              )
            }
            disabled={item.isDisabled}>
            {item.text}
          </Mantine.Menu.Item>
        ))}
      </Mantine.Menu.Dropdown>
    </Mantine.Menu>
  );
}
