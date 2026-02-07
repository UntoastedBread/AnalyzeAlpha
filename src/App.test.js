import { render, screen } from '@testing-library/react';
import App from './App';

test('renders stock analyzer', () => {
  render(<App />);
  const heading = screen.getByText(/Stock Analyzer/i);
  expect(heading).toBeInTheDocument();
});
