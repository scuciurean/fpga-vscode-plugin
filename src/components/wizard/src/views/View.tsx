// src/views/View.tsx
import React from 'react';

interface ViewProps {
  title: string;
}

const View: React.FC<ViewProps> = ({ title }) => {
  return (
    <div>
      <h2>{title}</h2>
      <p>This is the {title} view.</p>
    </div>
  );
};

export default View;
