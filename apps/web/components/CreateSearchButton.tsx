'use client';

import { useState } from 'react';
import { CreateSearchDialog } from './CreateSearchDialog';

interface CreateSearchButtonProps {
  onSearchCreated: () => void;
}

export function CreateSearchButton({ onSearchCreated }: CreateSearchButtonProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
      >
        + Create Search
      </button>

      <CreateSearchDialog
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        onSearchCreated={() => {
          setIsOpen(false);
          onSearchCreated();
        }}
      />
    </>
  );
}