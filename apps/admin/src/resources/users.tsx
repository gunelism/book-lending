import {
  BooleanField,
  BooleanInput,
  Create,
  Datagrid,
  DateField,
  DeleteButton,
  Edit,
  EmailField,
  List,
  NullableBooleanInput,
  PasswordInput,
  required,
  SaveButton,
  SearchInput,
  SelectField,
  SelectInput,
  SimpleForm,
  TextField,
  TextInput,
  Toolbar,
  email,
  minLength,
  regex,
} from 'react-admin';
import { useFieldHelp } from '../formHelp';

const ROLES = [
  { id: 'ADMIN', name: 'Admin' },
  { id: 'LIBRARIAN', name: 'Librarian' },
];

const passwordRules = [
  minLength(12, 'At least 12 characters'),
  regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/, 'Needs upper-case, lower-case and a digit'),
];

const userFilters = [
  <SearchInput key="q" source="q" alwaysOn />,
  <SelectInput key="role" source="role" choices={ROLES} alwaysOn emptyText="Any role" />,
  <NullableBooleanInput key="isActive" source="isActive" label="Active" />,
];

/** Staff accounts. This whole resource only exists for admins. */
export const UserList = () => (
  <List filters={userFilters} sort={{ field: 'name', order: 'ASC' }}>
    <Datagrid rowClick="edit" bulkActionButtons={false}>
      <TextField source="name" />
      <EmailField source="email" />
      <SelectField source="role" choices={ROLES} />
      <BooleanField source="isActive" label="Active" />
      <BooleanField source="githubLinked" label="GitHub" sortable={false} />
      <DateField source="lastLoginAt" label="Last sign-in" showTime emptyText="never" />
    </Datagrid>
  </List>
);

const UserToolbar = () => (
  <Toolbar sx={{ display: 'flex', justifyContent: 'space-between' }}>
    <SaveButton />
    <DeleteButton mutationMode="pessimistic" />
  </Toolbar>
);

export const UserEdit = () => (
  <Edit mutationMode="pessimistic">
    <SimpleForm toolbar={<UserToolbar />}>
      <TextField source="email" />
      <UserFields />
      <PasswordInput source="password" label="New password" validate={passwordRules} helperText="Leave empty to keep the current password. A new one signs the user out everywhere." />
    </SimpleForm>
  </Edit>
);

/** Helper texts come from the API's field definitions — the same ones the Help chat answers from. */
const UserFields = ({ create = false }: { create?: boolean }) => {
  const help = useFieldHelp('user');
  return (
    <>
      {create && <TextInput source="email" validate={[required(), email()]} helperText={help('email')} fullWidth />}
      <TextInput source="name" validate={required()} helperText={help('name')} />
      <SelectInput source="role" choices={ROLES} validate={required()} helperText={help('role')} />
      {create && <PasswordInput source="password" validate={[required(), ...passwordRules]} helperText={help('password')} />}
      <BooleanInput source="isActive" label="Active" helperText={help('isActive')} />
    </>
  );
};

export const UserCreate = () => (
  <Create redirect="list">
    <SimpleForm defaultValues={{ role: 'LIBRARIAN', isActive: true }}>
      <UserFields create />
    </SimpleForm>
  </Create>
);
