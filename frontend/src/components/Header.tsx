interface HeaderProps {
  title: string;
  subtitle: string;
}

const Header = ({ title, subtitle }: HeaderProps) => {
  return (
    <header className="w-full bg-white border-b border-gray-200 px-8 py-4">
      <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
      <p className="text-gray-600 text-sm">{subtitle}</p>
    </header>
  );
};

export default Header;