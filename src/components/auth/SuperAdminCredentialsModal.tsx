import React from 'react';
import { AccountCredentialsModal } from './AccountCredentialsModal';

interface SuperAdminCredentialsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SuperAdminCredentialsModal: React.FC<SuperAdminCredentialsModalProps> = ({
  isOpen,
  onClose,
}) => {
  return <AccountCredentialsModal isOpen={isOpen} onClose={onClose} initialTab="my_account" />;
};
