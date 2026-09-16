import type { Meta, StoryObj } from '@storybook/react-vite';
import { ClosedScreen } from './ClosedScreen';

const meta = { title: 'Screens/Closed', component: ClosedScreen } satisfies Meta<typeof ClosedScreen>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Dark: Story = { globals: { theme: 'dark' } };
