import AuthorIcon from '@mui/icons-material/HistoryEdu';
import BookIcon from '@mui/icons-material/MenuBook';
import CopyIcon from '@mui/icons-material/QrCode2';
import LoanIcon from '@mui/icons-material/SwapHoriz';
import MemberIcon from '@mui/icons-material/People';
import UserIcon from '@mui/icons-material/AdminPanelSettings';
import { Admin, Resource } from 'react-admin';
import { authProvider, type Role } from './authProvider';
import { Dashboard } from './Dashboard';
import { dataProvider } from './dataProvider';
import { Layout } from './Layout';
import { LoginPage } from './LoginPage';
import { AuthorCreate, AuthorEdit, AuthorList, AuthorShow } from './resources/authors';
import { BookCreate, BookEdit, BookList, BookShow } from './resources/books';
import { CopyList } from './resources/copies';
import { LoanCreate, LoanList, LoanShow } from './resources/loans';
import { MemberCreate, MemberEdit, MemberList } from './resources/members';
import { UserCreate, UserEdit, UserList } from './resources/users';

/**
 * Resources are registered per role. A librarian's admin is visibly smaller:
 * no Staff menu, no create/edit screens for the catalogue (read-only "show"
 * pages instead), no delete buttons and fewer bulk actions. The API enforces
 * the same rules independently.
 */
export const App = () => (
  <Admin
    dataProvider={dataProvider}
    authProvider={authProvider}
    loginPage={LoginPage}
    dashboard={Dashboard}
    layout={Layout}
    title="Library Admin"
    requireAuth
    disableTelemetry
  >
    {(role: Role) => {
      const isAdmin = role === 'ADMIN';
      return [
        <Resource key="loans" name="loans" list={LoanList} show={LoanShow} create={LoanCreate} icon={LoanIcon} options={{ label: 'Loans' }} />,
        <Resource key="members" name="members" list={MemberList} edit={MemberEdit} create={MemberCreate} icon={MemberIcon} recordRepresentation="fullName" />,
        <Resource
          key="books"
          name="books"
          list={BookList}
          show={BookShow}
          edit={isAdmin ? BookEdit : undefined}
          create={isAdmin ? BookCreate : undefined}
          icon={BookIcon}
          recordRepresentation="title"
        />,
        <Resource key="copies" name="copies" list={CopyList} icon={CopyIcon} recordRepresentation="barcode" />,
        <Resource
          key="authors"
          name="authors"
          list={AuthorList}
          show={AuthorShow}
          edit={isAdmin ? AuthorEdit : undefined}
          create={isAdmin ? AuthorCreate : undefined}
          icon={AuthorIcon}
          recordRepresentation="fullName"
        />,
        isAdmin && <Resource key="users" name="users" list={UserList} edit={UserEdit} create={UserCreate} icon={UserIcon} options={{ label: 'Staff' }} />,
      ];
    }}
  </Admin>
);
