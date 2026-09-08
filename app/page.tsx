import Chat from './chat';
import { getChatGPTUser } from './chatgpt-auth';
export const dynamic = 'force-dynamic';
export default async function Page() { return <Chat signedIn={!!(await getChatGPTUser())} />; }
