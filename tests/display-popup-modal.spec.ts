/** @jest-environment jsdom */

jest.mock('../src/home/ready-toolbar', () => ({
  toolbar: { scrollTo: jest.fn() }
}));

import { displayPopupMessage, renderErrorInModal } from '../src/home/rendering/display-popup-modal';

describe('displayPopupMessage', () => {
  it('sets title and body, toggles error class', () => {
    displayPopupMessage({ modalHeader: 'Test Title', modalBody: 'Test Body', isError: true, url: 'https://example.com' });
    expect(document.getElementById('preview-title')?.textContent).toBe('Test Title');
    expect(document.getElementById('preview-body-inner')?.innerHTML).toBe('Test Body');
    expect(document.getElementById('preview-modal')?.classList.contains('error')).toBe(true);
    expect(document.getElementById('preview-title-anchor')?.getAttribute('href')).toBe('https://example.com');
    expect(document.getElementById('preview-modal')?.classList.contains('active')).toBe(true);
    expect(document.body.classList.contains('preview-active')).toBe(true);
  });
});

describe('renderErrorInModal', () => {
  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('logs message and calls displayPopupMessage', () => {
    renderErrorInModal(new Error('Test error'), 'Test info');
    expect(console.error).toHaveBeenCalledWith(new Error('Test error'));
    expect(document.getElementById('preview-title')?.textContent).toBe('Error');
    expect(document.getElementById('preview-body-inner')?.innerHTML).toBe('Test info');
  });

  it('handles undefined info', () => {
    renderErrorInModal(new Error('Test error'));
    expect(console.error).toHaveBeenCalledWith('Test error');
  });
});
