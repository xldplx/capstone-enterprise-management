import { formatGroupedWholeInput, formatWholeNumber } from '../utils/numberFormat';

export default function CurrencyInput({ value, onChange, onRejectedInput, ...props }) {
    const handleChange = (event) => {
        const formatted = formatGroupedWholeInput(event.target.value);
        if (formatted === null) {
            onRejectedInput?.('Use whole numbers only. Commas and spaces are accepted.');
            return;
        }
        onRejectedInput?.('');
        onChange?.(formatted);
    };

    return (
        <input
            {...props}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={formatWholeNumber(value)}
            onChange={handleChange}
        />
    );
}
