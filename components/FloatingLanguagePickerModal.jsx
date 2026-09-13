import React from "react";
import GeneralModal from "./GeneralModal";

const FloatingLanguagePickerModal = ({
  visible,
  title,
  options,
  selectedValue,
  onSelect,
  onClose,
}) => {
  return (
    <GeneralModal
      visible={visible}
      title={title}
      options={options}
      selectedValue={selectedValue}
      onSelect={onSelect}
      onClose={onClose}
    />
  );
};

export default FloatingLanguagePickerModal;
